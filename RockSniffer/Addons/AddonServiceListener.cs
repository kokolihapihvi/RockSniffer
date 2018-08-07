using Newtonsoft.Json;
using RockSnifferLib.Events;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using System;
using System.Drawing.Imaging;
using System.IO;
using System.Net.Sockets;
using System.Text;

namespace RockSniffer.Addons
{
    internal class AddonServiceListener
    {
        //Class to easily serialize response data
        [Serializable]
        private class JsonResponse
        {
            public bool success = false;
            public SnifferState currentState = SnifferState.NONE;
            public RSMemoryReadout memoryReadout;
            public SongDetails songDetails;
            public string albumCoverBase64;

            public string Version {
                get {
                    return Program.version;
                }
            }
        }

        private TcpListener tcpListener;

        private RSMemoryReadout memReadout = new RSMemoryReadout();
        private SongDetails songDetails = new SongDetails();

        //Cache the response
        private JsonResponse jsResp = new JsonResponse();

        public AddonServiceListener(TcpListener socket)
        {
            tcpListener = socket;
        }

        internal void OnCurrentSongChanged(object sender, OnSongChangedArgs args)
        {
            songDetails = args.songDetails;

            jsResp.songDetails = songDetails;

            try
            {
                if (songDetails.albumArt != null)
                {
                    using (MemoryStream ms = new MemoryStream())
                    {
                        jsResp.songDetails.albumArt.Save(ms, ImageFormat.Jpeg);
                        jsResp.albumCoverBase64 = Convert.ToBase64String(ms.ToArray());
                    }
                }
            }
            catch
            {
                //Catch all errors related to album art
            }
        }

        internal void OnMemoryReadout(object sender, OnMemoryReadoutArgs args)
        {
            memReadout = args.memoryReadout;

            jsResp.memoryReadout = memReadout;
        }

        internal void OnStateChanged(object sender, OnStateChangedArgs args)
        {
            jsResp.currentState = args.newState;
        }

        public void Listen()
        {
            while (true)
            {
                Socket s = tcpListener.AcceptSocket();

                if (memReadout != null && songDetails != null && songDetails.IsValid())
                {
                    jsResp.success = true;
                }
                else
                {
                    jsResp.success = false;
                }

                ServeClient(s);
            }
        }

        private void ServeClient(Socket s)
        {
            string content = JsonConvert.SerializeObject(jsResp);

            byte[] resp = Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {Encoding.UTF8.GetByteCount(content)}\r\nContent-Type: text/json\r\nAccess-Control-Allow-Origin: *\r\n\r\n{ content }\r\n");

            using (var context = new SocketAsyncEventArgs())
            {
                context.SetBuffer(resp, 0, resp.Length);

                s.SendAsync(context);
            }
        }
    }
}
