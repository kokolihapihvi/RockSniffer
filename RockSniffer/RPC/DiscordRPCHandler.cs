using DiscordRPC;
using DiscordRPC.Logging;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.RSHelpers.NoteData;
using RockSnifferLib.Sniffing;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Timers;

namespace RockSniffer.RPC
{
    public class DiscordRPCHandler : IDisposable
    {
        private DiscordRpcClient client;
        private RSMemoryReadout readout;
        private SnifferState state = SnifferState.NONE;
        private SongDetails songdetails;
        private AlbumArtResolver? albumArtResolver;

        private System.Timers.Timer timer;
        private readonly object membersLock = new object();

        private readonly Dictionary<string, string> gcadeGames = new Dictionary<string, string>()
        {
            ["GC_WhaleRider"] = "Gone Wailin'!",
            ["GC_StringSkipSaloon"] = "String Skip Saloon",
            ["GC_DucksPlus"] = "Ducks ReDux",
            ["GC_NinjaSlides"] = "Ninja Slide N",
            ["GC_ScaleWarriorsMenu"] = "Scale Warriors",
            ["GC_RailShooterMenu"] = "Return to Chastle Chordead",
            ["GC_TrackAndField"] = "Hurtlin' Hurdles",
            ["GC_TempleOfBends"] = "Temple of Bends",
            ["GC_ScaleRacer"] = "Scale Racer",
            ["GC_StarChords"] = "Star Chords",
            ["GC_HarmonicHeist"] = "Harmonic Heist"
        };

        private readonly DateTime appStartTime;

        public DiscordRPCHandler(Sniffer sniffer)
        {
            client = new DiscordRpcClient(Program.config.rpcSettings.client_id);

            if (Program.config.rpcSettings.enableCoverArt)
            {
                 albumArtResolver = new AlbumArtResolver();
            }

            //Set the logger
            client.Logger = new ConsoleLogger() { Level = LogLevel.Warning };

            //Subscribe to events
            client.OnReady += (sender, e) =>
            {
                Logger.Log("[RPC] Received Ready from user {0}", e.User.Username);
                UpdatePresence();
            };

            //Initialize rpc client
            client.Initialize();

            appStartTime = DateTime.UtcNow;

            //Listen to events
            sniffer.OnStateChanged += Sniffer_OnStateChanged;
            sniffer.OnMemoryReadout += Sniffer_OnMemoryReadout;
            sniffer.OnSongChanged += Sniffer_OnSongChanged;

            // Set up presence update timer
            timer = new System.Timers.Timer(Math.Max(250, Program.config.rpcSettings.updatePeriodMs));
            timer.Elapsed += CondUpdatePresence;
            timer.AutoReset = true;
            timer.Enabled = true;
        }

        internal void CondUpdatePresence(Object source, ElapsedEventArgs e) {
            lock (membersLock)
            {
                UpdatePresence();
            }
        }

        internal void UpdatePresence()
        {
            //Construct rich presence
            var rp = new RichPresence();
            rp.Assets = new Assets();
            rp.Assets.LargeImageKey = "rocksmith";
            rp.Assets.LargeImageText = "Rocksmith 2014 Remastered";

            //If we have a valid song and are playing a song
            if ((songdetails != null && readout != null) && (state == SnifferState.SONG_STARTING || state == SnifferState.SONG_PLAYING || state == SnifferState.SONG_ENDING))
            {
                try
                {
                    // Get the appropriate album cover
                    if (albumArtResolver != null && albumArtResolver.Get(songdetails) is (string resURL, string resDisplayText) resultTuple)
                    {
                        rp.Assets.LargeImageKey = resURL;
                        rp.Assets.LargeImageText = resDisplayText.Substring(0, Math.Min(resDisplayText.Length, 128));
                    }
                }
                catch (Exception ex) { Logger.LogException(ex); }

                //Get the arrangement based on the arrangement id
                var arrangement = songdetails.arrangements.FirstOrDefault(x => x.arrangementID == readout.arrangementID);

                //Add song name
                rp.Details = $"Playing {songdetails.songName}";

                //Add artist name
                rp.State = $"by {songdetails.artistName}";

                //Set song timer
                rp.Timestamps = new Timestamps(DateTime.UtcNow, DateTime.UtcNow.AddSeconds(songdetails.songLength - readout.songTimer));

                //Calculate accuracy
                float accuracy = readout.noteData.Accuracy;

                string accuracyText = FormattableString.Invariant($"{accuracy:F2}%");

                //Set accuracy as text for arrangement icon
                rp.Assets.SmallImageText = accuracyText;

                if (readout.mode == RSMode.SCOREATTACK)
                {
                    var sand = (ScoreAttackNoteData)readout.noteData;

                    rp.Assets.SmallImageText = $"{FormattableString.Invariant($"{sand.CurrentScore:n0}")} x{sand.CurrentMultiplier} | {rp.Assets.SmallImageText}";

                    if (sand.FailedPhrases > 0)
                    {
                        rp.Assets.SmallImageText = $"{new string('X', sand.FailedPhrases)} | {rp.Assets.SmallImageText}";
                    }
                }

                //When we got the arrangement
                if (arrangement != null)
                {
                    //Set arrangement icon
                    rp.Assets.SmallImageKey = arrangement.type.ToLower();

                    //Try to get section
                    var section = arrangement.sections.LastOrDefault(x => x.startTime < readout.songTimer);

                    //If we got a section
                    if (section != null)
                    {
                        //Add section to small image text
                        rp.Assets.SmallImageText = $"{section.name} | {rp.Assets.SmallImageText}";
                    }
                }

                if (string.IsNullOrEmpty(rp.Assets.SmallImageKey) && rp.Assets.LargeImageKey != "rocksmith")
                    rp.Assets.SmallImageKey = "rocksmith";
            }
            else
            {
                rp.Details = "Browsing Menus";

                if (readout != null)
                {
                    string gameStage = readout.gameStage.ToLowerInvariant().Trim();

                    string state = "";

                    if (gameStage.StartsWith("main"))
                    {
                        state = "Main Menu";
                    }
                    else if (gameStage.StartsWith("las"))
                    {
                        state = "Learn A Song";
                    }
                    else if (gameStage.StartsWith("sm"))
                    {
                        state = "Session Mode";
                    }
                    else if (gameStage.StartsWith("nsp"))
                    {
                        state = "Nonstop Play";
                    }
                    else if (gameStage.StartsWith("sa"))
                    {
                        state = "Score Attack";
                    }
                    else if (gameStage.StartsWith("guitarcade") || gameStage.StartsWith("gc_games"))
                    {
                        state = "Guitarcade";
                    }
                    else if (gameStage.StartsWith("gcade"))
                    {
                        rp.Details = "Playing Guitarcade";
                        state = "";

                        if (gcadeGames.ContainsKey(readout.songID))
                        {
                            state = gcadeGames[readout.songID];
                        }
                    }
                    else if (gameStage.StartsWith("ge_"))
                    {
                        state = "Lessons";
                    }
                    else if (gameStage.StartsWith("mp_"))
                    {
                        state = "Multiplayer";
                    }
                    else if (gameStage.StartsWith("shop"))
                    {
                        state = "Shop";
                    }


                    rp.State = state;
                }

                rp.Timestamps = new Timestamps(appStartTime);
            }

            client.SetPresence(rp);
        }

        private void Sniffer_OnSongChanged(object sender, RockSnifferLib.Events.OnSongChangedArgs e)
        {
            lock (membersLock) {
                songdetails = e.songDetails;
            }
        }

        private void Sniffer_OnMemoryReadout(object sender, RockSnifferLib.Events.OnMemoryReadoutArgs e)
        {
            lock (membersLock)
            {
                readout = e.memoryReadout;
            }
        }

        private void Sniffer_OnStateChanged(object sender, RockSnifferLib.Events.OnStateChangedArgs e)
        {
            lock (membersLock)
            {
                state = e.newState;
            }
        }

        public void Dispose()
        {
            Logger.Log("[RPC] Disposing");
            client.Dispose();
        }
    }
}
