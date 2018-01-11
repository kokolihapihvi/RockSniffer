using RockSniffer.Addons;
using RockSniffer.Configuration;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using RockSnifferLib.SysHelpers;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Threading;

namespace RockSniffer
{
    class Program
    {
        internal const string version = "0.1.0";

        internal static Cache cache;
        internal static Config config;

        internal static Process rsProcess;

        public static Random random = new Random();

        internal static string tempdir = AppDomain.CurrentDomain.BaseDirectory + "temp";
        internal static string cachedir = AppDomain.CurrentDomain.BaseDirectory + "cache";

        private static AddonService addonService;
        private Image defaultAlbumCover = new Bitmap(256, 256);

        private RSMemoryReadout memReadout = new RSMemoryReadout();
        private SongDetails details = new SongDetails();

        static void Main(string[] args)
        {
            Program p = new Program();
            p.Initialize();

            //Keep running even when rocksmith disappears
            while (true)
            {
                p.Run();
            }
        }

        public void Initialize()
        {
            //Set title and print version
            Console.Title = string.Format("RockSniffer {0}", version);
            Console.WriteLine("RockSniffer {0} ({1}bits)", version, CustomAPI.Is64Bits() ? "64" : "32");

            //Initialize and load configuration
            config = new Config();
            config.Load();

            //Transfer logging options
            Logger.logCache = config.debugSettings.debugCache;
            Logger.logFileDetailQuery = config.debugSettings.debugFileDetailQuery;
            Logger.logHIRCScan = config.debugSettings.debugHIRCScan;
            Logger.logMemoryReadout = config.debugSettings.debugMemoryReadout;
            Logger.logSongDetails = config.debugSettings.debugSongDetails;
            Logger.logSystemHandleQuery = config.debugSettings.debugSystemHandleQuery;

            //Initialize cache
            cache = new Cache(cachedir);

            //Create directories
            Directory.CreateDirectory("output");

            //Enable addon service if configured
            if (config.addonSettings.enableAddons)
            {
                addonService = new AddonService();
            }
        }

        public void Run()
        {
            //Clear output / create output files
            ClearOutput();

            Console.WriteLine("Waiting for rocksmith");

            //Loop infinitely trying to find rocksmith process
            while (true)
            {
                var processes = Process.GetProcessesByName("Rocksmith2014"); //Rocksmith2014

                //Sleep for 1 second if no processes found
                if (processes.Length == 0)
                {
                    Thread.Sleep(1000);
                    continue;
                }

                //Select the first rocksmith process and open a handle
                rsProcess = processes[0];

                if (rsProcess.HasExited || !rsProcess.Responding)
                {
                    Thread.Sleep(1000);
                    continue;
                }

                break;
            }

            Console.WriteLine("Rocksmith found! Sniffing...");

            //Initialize file handle reader and memory reader
            Sniffer sniffer = new Sniffer(rsProcess, cache);

            //Listen for events
            sniffer.OnCurrentSongChanged += Sniffer_OnCurrentSongChanged;
            sniffer.OnMemoryReadout += Sniffer_OnMemoryReadout;

            //Inform AddonService
            if (config.addonSettings.enableAddons)
            {
                addonService.SetSniffer(sniffer);
            }

            while (true)
            {
                if (rsProcess == null || rsProcess.HasExited)
                {
                    break;
                }

                OutputDetails();

                //GOTTA GO FAST
                Thread.Sleep(1000);

                if (random.Next(0, 100) > 99)
                {
                    Console.WriteLine("*sniff sniff*");
                }
            }

            sniffer.Stop();

            //Clean up as best as we can
            rsProcess.Dispose();
            rsProcess = null;

            Console.WriteLine("This is rather unfortunate, the Rocksmith2014 process has vanished :/");
        }

        private void Sniffer_OnMemoryReadout(RSMemoryReadout memReadout)
        {
            this.memReadout = memReadout;
        }

        private void Sniffer_OnCurrentSongChanged(SongDetails songDetails)
        {
            details = songDetails;

            //Write album art
            if (details.albumArt != null)
            {
                WriteImageToFileLocking("output/album_cover.jpeg", details.albumArt);
            }
            else
            {
                WriteImageToFileLocking("output/album_cover.jpeg", defaultAlbumCover);
            }
        }

        public static string FormatTime(float lengthTime)
        {
            TimeSpan t = TimeSpan.FromSeconds(Math.Ceiling(lengthTime));
            return t.ToString(config.formatSettings.timeFormat);
        }

        public static string FormatPercentage(double frac)
        {
            return string.Format(config.formatSettings.percentageFormat, frac * 100d);
        }

        private void OutputDetails()
        {
            //Print memreadout if debug is enabled
            memReadout.print();

            //TODO: remember state of each file and only update the ones that have changed!
            foreach (OutputFile of in config.outputSettings.output)
            {
                //Clone the output text format so we can replace strings in it without changing the original
                string outputtext = (string)of.format.Clone();

                //Replace strings from song details
                outputtext = outputtext.Replace("%SONG_ARTIST%", details.artistName);
                outputtext = outputtext.Replace("%SONG_NAME%", details.songName);
                outputtext = outputtext.Replace("%SONG_ALBUM%", details.albumName);
                outputtext = outputtext.Replace("%ALBUM_YEAR%", details.albumYear.ToString());
                outputtext = outputtext.Replace("%SONG_LENGTH%", FormatTime(details.songLength));

                //If this output contained song detail information
                if (outputtext != of.format)
                {
                    //And our current song details are not valid
                    if (!details.IsValid())
                    {
                        //Output nothing
                        outputtext = "";
                    }
                }

                //Replace strings from memory readout
                outputtext = outputtext.Replace("%SONG_TIMER%", FormatTime(memReadout.songTimer));
                outputtext = outputtext.Replace("%NOTES_HIT%", memReadout.totalNotesHit.ToString());
                outputtext = outputtext.Replace("%CURRENT_STREAK%", (memReadout.currentHitStreak - memReadout.currentMissStreak).ToString());
                outputtext = outputtext.Replace("%HIGHEST_STREAK%", memReadout.highestHitStreak.ToString());
                outputtext = outputtext.Replace("%NOTES_MISSED%", memReadout.totalNotesMissed.ToString());
                outputtext = outputtext.Replace("%TOTAL_NOTES%", memReadout.TotalNotes.ToString());
                outputtext = outputtext.Replace("%CURRENT_ACCURACY%", FormatPercentage((memReadout.totalNotesHit > 0 && memReadout.TotalNotes > 0) ? ((double)memReadout.totalNotesHit / (double)memReadout.TotalNotes) : 0));

                //Write to output
                WriteTextToFileLocking("output/" + of.filename, outputtext);
            }
        }

        private void ClearOutput()
        {
            //Clear all output files
            foreach (OutputFile of in config.outputSettings.output)
            {
                //Write to output
                WriteTextToFileLocking("output/" + of.filename, "");
            }

            //Clear album art
            WriteImageToFileLocking("output/album_cover.jpeg", defaultAlbumCover);

            //Clear AddonService
            if (config.addonSettings.enableAddons)
            {
                //addonService.SetSniffer(null);
            }
        }

        private void WriteImageToFileLocking(string file, Image image)
        {
            //If the file doesn't exist, create it by writing an empty string into it
            if (!File.Exists(file))
            {
                File.WriteAllText(file, "");
            }

            //Open a file stream, write access, read only sharing
            using (FileStream fstream = new FileStream(file, FileMode.Truncate, FileAccess.Write, FileShare.None))
            {
                image.Save(fstream, ImageFormat.Jpeg);
            }
        }

        private void WriteTextToFileLocking(string file, string contents)
        {
            //If the file doesn't exist, create it by writing an empty string into it
            if (!File.Exists(file))
            {
                File.WriteAllText(file, "");
            }

            //Encode with UTF-8
            byte[] data = Encoding.UTF8.GetBytes(contents);

            //Write to file
            WriteToFileLocking(file, data);
        }

        private void WriteToFileLocking(string file, byte[] contents)
        {
            //Open a file stream, write access, read only sharing
            using (FileStream fstream = new FileStream(file, FileMode.Truncate, FileAccess.Write, FileShare.Read))
            {
                //Write to file
                fstream.Write(contents, 0, contents.Length);
            }
        }

        public static void PrintError(string text, params object[] p)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine(text, p);
            Console.ResetColor();
        }
    }
}
