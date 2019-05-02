using DiscordRPC;
using DiscordRPC.Logging;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using System;
using System.Linq;

namespace RockSniffer.RPC
{
    public class DiscordRPCHandler : IDisposable
    {
        private DiscordRpcClient client;
        private RSMemoryReadout readout;
        private SnifferState state = SnifferState.NONE;
        private SongDetails songdetails;

        private DateTime songStartTime;
        private DateTime appStartTime;

        public DiscordRPCHandler()
        {
            client = new DiscordRpcClient(Program.config.rpcSettings.client_id);

            //Set the logger
            client.Logger = new ConsoleLogger() { Level = LogLevel.Warning };

            //Subscribe to events
            client.OnReady += (sender, e) =>
            {
                Logger.Log("[RPC] Received Ready from user {0}", e.User.Username);
            };

            client.Initialize();

            appStartTime = DateTime.UtcNow;
        }

        internal void UpdatePresence()
        {
            //Return if song details or readout is null
            if (songdetails == null || readout == null)
            {
                return;
            }

            var arrangement = songdetails.arrangements.FirstOrDefault(x => x.arrangementID == readout.arrangementID);

            var rp = new RichPresence();
            rp.Assets = new Assets();
            rp.Assets.LargeImageKey = "rocksmith";
            rp.Assets.LargeImageText = "Rocksmith 2014 Remastered";

            if (state == SnifferState.SONG_STARTING || state == SnifferState.SONG_PLAYING || state == SnifferState.SONG_ENDING)
            {
                rp.Details = $"Playing {songdetails.songName}";

                if (arrangement != null)
                {
                    rp.Assets.SmallImageKey = arrangement.name.ToLower();
                }

                rp.State = $"by {songdetails.artistName}";
                rp.Timestamps = new Timestamps(DateTime.UtcNow, DateTime.UtcNow.AddSeconds(songdetails.songLength - readout.songTimer));

                float accuracy = 100;

                if (readout.TotalNotes > 0 && readout.totalNotesHit > 0)
                {
                    accuracy = ((float)readout.totalNotesHit / (float)readout.TotalNotes) * 100f;
                }

                rp.Assets.SmallImageText = $"{accuracy:F2}%";

                if (arrangement != null)
                {
                    var section = arrangement.sections.LastOrDefault(x => x.startTime < readout.songTimer);

                    if (section != null)
                    {
                        rp.Assets.SmallImageText = $"{section.name} | {accuracy:F2}%";
                    }
                }
            }
            else
            {
                rp.Details = "Browsing menus";
                rp.State = readout.gameStage;
                rp.Timestamps = new Timestamps(appStartTime);
            }

            client.SetPresence(rp);
        }

        internal void Listen(Sniffer sniffer)
        {
            sniffer.OnStateChanged += Sniffer_OnStateChanged;
            sniffer.OnMemoryReadout += Sniffer_OnMemoryReadout;
            sniffer.OnSongChanged += Sniffer_OnSongChanged;
        }

        private void Sniffer_OnSongChanged(object sender, RockSnifferLib.Events.OnSongChangedArgs e)
        {
            songdetails = e.songDetails;
            UpdatePresence();
        }

        private void Sniffer_OnMemoryReadout(object sender, RockSnifferLib.Events.OnMemoryReadoutArgs e)
        {
            readout = e.memoryReadout;
            UpdatePresence();
        }

        private void Sniffer_OnStateChanged(object sender, RockSnifferLib.Events.OnStateChangedArgs e)
        {
            state = e.newState;

            if (e.newState == SnifferState.SONG_STARTING)
            {
                songStartTime = DateTime.UtcNow;
            }

            UpdatePresence();
        }

        public void Dispose()
        {
            client.Dispose();
        }
    }
}
