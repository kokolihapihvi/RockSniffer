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

        private readonly DateTime appStartTime;

        public DiscordRPCHandler(Sniffer sniffer)
        {
            client = new DiscordRpcClient(Program.config.rpcSettings.client_id);

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
                //Get the arrangement based on the arrangement id
                var arrangement = songdetails.arrangements.FirstOrDefault(x => x.arrangementID == readout.arrangementID);

                //Add song name
                rp.Details = $"Playing {songdetails.songName}";

                //Add artist name
                rp.State = $"by {songdetails.artistName}";

                //Set song timer
                rp.Timestamps = new Timestamps(DateTime.UtcNow, DateTime.UtcNow.AddSeconds(songdetails.songLength - readout.songTimer));

                //Calculate accuracy
                float accuracy = 100;

                if (readout.TotalNotes > 0 && readout.totalNotesHit > 0)
                {
                    accuracy = ((float)readout.totalNotesHit / (float)readout.TotalNotes) * 100f;
                }

                //Set accuracy as text for arrangement icon
                rp.Assets.SmallImageText = $"{accuracy:F2}%";

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
            UpdatePresence();
        }

        public void Dispose()
        {
            Logger.Log("[RPC] Disposing");
            client.Dispose();
        }
    }
}
