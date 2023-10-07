using Newtonsoft.Json.Linq;
using RockSniffer.Addons;
using RockSniffer.Addons.Storage;
using RockSniffer.Configuration;
using RockSniffer.RPC;
using RockSnifferLib.Cache;
using RockSnifferLib.Events;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.RSHelpers.NoteData;
using RockSnifferLib.Sniffing;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace RockSniffer
{
    class Program
    {
        internal const string version = "0.4.2";

        internal static ICache cache;
        internal static Config config;

        internal static Process rsProcess;

        private static readonly Random random = new Random();

        private static readonly bool Is64Bits = (IntPtr.Size == 8);

        private static AddonService addonService;
        private readonly Image defaultAlbumCover = new Bitmap(256, 256);

        private RSMemoryReadout memReadout = new RSMemoryReadout();
        private SongDetails details = new SongDetails();
        private DiscordRPCHandler rpcHandler;

        static void Main(string[] args)
        {
            Program p = new Program();
            p.Initialize();

            //Keep running even when rocksmith disappears
            while (true)
            {
                try
                {
                    p.Run();
                }
                catch (Exception e)
                {
                    //Catch all exceptions that are not handled and log
                    Logger.LogError("Encountered unhandled exception: {0}\r\n{1}", e.Message, e.StackTrace);
                    throw;
                }
            }
        }

        public void Initialize()
        {
            //Set title and print version
            Console.Title = string.Format("RockSniffer {0}", version);
            Logger.Log("RockSniffer {0} ({1}bits)", version, Is64Bits ? "64" : "32");

            //Initialize and load configuration
            config = new Config();
            try
            {
                config.Load();
            }
            catch (Exception e)
            {
                Logger.LogError("Could not load configuration: {0}\r\n{1}", e.Message, e.StackTrace);
                throw;
            }

            //Run version check
            if (!config.debugSettings.disableVersionCheck)
            {
                VersionCheck();
            }

            //Transfer logging options
            Logger.logStateMachine = config.debugSettings.debugStateMachine;
            Logger.logCache = config.debugSettings.debugCache;
            Logger.logFileDetailQuery = config.debugSettings.debugFileDetailQuery;
            Logger.logMemoryReadout = config.debugSettings.debugMemoryReadout;
            Logger.logSongDetails = config.debugSettings.debugSongDetails;
            Logger.logSystemHandleQuery = config.debugSettings.debugSystemHandleQuery;
            Logger.logProcessingQueue = config.debugSettings.debugProcessingQueue;

            //Initialize cache
            cache = new SQLiteCache();

            //Create directories
            Directory.CreateDirectory("output");

            //Enable addon service if configured
            if (config.addonSettings.enableAddons)
            {
                try
                {
                    addonService = new AddonService(config.addonSettings, new SQLiteStorage());
                }
                catch (SocketException e)
                {
                    Logger.LogError("Please verify that the IP address is valid and the port is not already in use");
                    Logger.LogError("Could not start addon service: {0}\r\n{1}", e.Message, e.StackTrace);
                }
                catch (Exception e)
                {
                    Logger.LogError("Could not start addon service: {0}\r\n{1}", e.Message, e.StackTrace);
                }
            }
        }

        private async void VersionCheck()
        {
            if (version.Contains("PR"))
            {
                Logger.Log("Pre-release version, skipping version check");
                return;
            }
            
            try
            {
                //Use TLS
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls12;

                //GET git api for newest release
                var request = WebRequest.CreateHttp("https://api.github.com/repos/kokolihapihvi/RockSniffer/releases/latest");
                request.Accept = "application/vnd.github.v3+json";
                request.Method = "GET";
                request.UserAgent = "RockSniffer";

                //Get the response
                using (var response = await request.GetResponseAsync())
                {
                    var httpresp = (HttpWebResponse)response;

                    //If status code was 200 OK
                    if (httpresp.StatusCode == HttpStatusCode.OK)
                    {
                        //Read the response
                        using (var reader = new StreamReader(httpresp.GetResponseStream()))
                        {
                            var respstr = await reader.ReadToEndAsync();

                            //Parse response as JSON
                            var respjson = JObject.Parse(respstr);

                            //Treat release body as a changelog
                            var changes = respjson.Value<string>("body");

                            //Get the newest release tag name, remove v prefix
                            var newest_release = respjson.Value<string>("tag_name").Substring(1);

                            //Compare to program version
                            var cversion = new Version(version);
                            var nversion = new Version(newest_release);

                            switch (cversion.CompareTo(nversion))
                            {
                                case -1:
                                    Console.ForegroundColor = ConsoleColor.Green;
                                    Logger.Log($"A new version ({newest_release}) of RockSniffer is available:\r\n{changes}");
                                    Console.ResetColor();
                                    break;
                                case 0:
                                    Logger.Log("RockSniffer is up to date");
                                    break;
                                default:
                                    break;
                            }
                        }
                    }
                }
            }
            catch
#if DEBUG
            (Exception e)
#endif
            {
                Logger.LogError("Version check failed");

#if DEBUG
                Logger.LogException(e);
#endif
            }
        }

        public void Run()
        {
            //Clear output / create output files
            ClearOutput();

            Logger.Log("Waiting for rocksmith");

            //Loop infinitely trying to find rocksmith process
            while (true)
            {
                var processes = Process.GetProcessesByName("Rocksmith2014");

                //Sleep for 1 second if no processes found
                if (processes.Length == 0)
                {
                    Thread.Sleep(1000);
                    continue;
                }

                // Check for multiple Rocksmith processes
                if (processes.Length > 1)
                {
                    Logger.LogError("Warning! More than one Rocksmith process found!");
                    foreach (var process in processes)
                    {
                        Logger.LogError($"{process.ProcessName} [pid {process.Id}]");
                    }
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

            Logger.Log("Rocksmith found! Sniffing...");

            //Check rocksmith executable hash to make sure its the correct version
            string hash = PSARCUtil.GetFileHash(new FileInfo(rsProcess.MainModule.FileName));

            Logger.Log($"Rocksmith executable hash: {hash}");

            if (!hash.Equals("HtUXPbqP7r9hrd5sRV8Seg=="))
            {
                Logger.LogError("Executable hash does not match expected hash, make sure you have the correct version");
                Logger.Log("Press any key to exit");
                Console.ReadKey();
                Environment.Exit(0);
            }

            //Initialize file handle reader and memory reader
            Sniffer sniffer = new Sniffer(rsProcess, cache, config.snifferSettings);

            //Listen for events
            sniffer.OnSongChanged += Sniffer_OnCurrentSongChanged;
            sniffer.OnMemoryReadout += Sniffer_OnMemoryReadout;

            //Add RPC event listeners
            if (config.rpcSettings.enabled)
            {
                rpcHandler = new DiscordRPCHandler(sniffer);
            }

            //Inform AddonService
            if (config.addonSettings.enableAddons && addonService != null)
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

                if (random.Next(100) == 0)
                {
                    Console.WriteLine("*sniff sniff*");
                }
            }

            sniffer.Stop();

            //Clean up as best as we can
            rsProcess.Dispose();
            rsProcess = null;

            rpcHandler?.Dispose();
            rpcHandler = null;

            Logger.Log("This is rather unfortunate, the Rocksmith2014 process has vanished :/");
        }

        private void Sniffer_OnMemoryReadout(object sender, OnMemoryReadoutArgs args)
        {
            memReadout = args.memoryReadout;
        }

        private void Sniffer_OnCurrentSongChanged(object sender, OnSongChangedArgs args)
        {
            details = args.songDetails;

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
            return string.Format(config.formatSettings.percentageFormat, frac);
        }

        private void OutputDetails()
        {
            //TODO: remember state of each file and only update the ones that have changed!
            foreach (OutputFile of in config.outputSettings.output)
            {
                //Clone the output text format so we can replace strings in it without changing the original
                string outputtext = (string)of.format.Clone();

                //Replace strings from song details
                outputtext = outputtext.Replace("%SONG_ID%", details.songID);
                outputtext = outputtext.Replace("%SONG_ARTIST%", details.artistName);
                outputtext = outputtext.Replace("%SONG_NAME%", details.songName);
                outputtext = outputtext.Replace("%SONG_ALBUM%", details.albumName);
                outputtext = outputtext.Replace("%ALBUM_YEAR%", details.albumYear.ToString());
                outputtext = outputtext.Replace("%SONG_LENGTH%", FormatTime(details.songLength));

                //Toolkit details
                if (details.toolkit != null)
                {
                    outputtext = outputtext.Replace("%TOOLKIT_VERSION%", details.toolkit.version);
                    outputtext = outputtext.Replace("%TOOLKIT_AUTHOR%", details.toolkit.author);
                    outputtext = outputtext.Replace("%TOOLKIT_PACKAGE_VERSION%", details.toolkit.package_version);
                    outputtext = outputtext.Replace("%TOOLKIT_COMMENT%", details.toolkit.comment);
                }

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

                var nd = memReadout.noteData ?? new LearnASongNoteData();

                //Replace strings from memory readout
                outputtext = outputtext.Replace("%SONG_TIMER%", FormatTime(memReadout.songTimer));
                outputtext = outputtext.Replace("%NOTES_HIT%", nd.TotalNotesHit.ToString());
                outputtext = outputtext.Replace("%CURRENT_STREAK%", (nd.CurrentHitStreak - nd.CurrentMissStreak).ToString());
                outputtext = outputtext.Replace("%HIGHEST_STREAK%", nd.HighestHitStreak.ToString());
                outputtext = outputtext.Replace("%NOTES_MISSED%", nd.TotalNotesMissed.ToString());
                outputtext = outputtext.Replace("%TOTAL_NOTES%", nd.TotalNotes.ToString());
                outputtext = outputtext.Replace("%CURRENT_ACCURACY%", FormatPercentage(nd.Accuracy));

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
        }

        private void WriteImageToFileLocking(string file, Image image)
        {
            //If the file doesn't exist, create it by writing an empty string into it
            if (!File.Exists(file))
            {
                File.WriteAllText(file, "");
            }

            try
            {
                //Open a file stream, write access, no sharing
                using (FileStream fstream = new FileStream(file, FileMode.Truncate, FileAccess.Write, FileShare.None))
                {
                    image.Save(fstream, ImageFormat.Jpeg);
                }
            }
            catch (Exception e)
            {
                Logger.LogError("Unable to write to file {0}: {1}\r\n{2}", file, e.Message, e.StackTrace);
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
            try
            {
                //Open a file stream, write access, read only sharing
                using (FileStream fstream = new FileStream(file, FileMode.Truncate, FileAccess.Write, FileShare.Read))
                {
                    //Write to file

                    fstream.Write(contents, 0, contents.Length);
                }
            }
            catch (Exception e)
            {
                Logger.LogError("Unable to write to file {0}: {1}\r\n{2}", file, e.Message, e.StackTrace);
            }
        }
    }
}
