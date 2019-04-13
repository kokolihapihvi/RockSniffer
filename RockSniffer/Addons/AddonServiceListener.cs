using Newtonsoft.Json;
using RockSniffer.Addons.Storage;
using RockSnifferLib.Events;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using System;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

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

        private Thread listenThread;

        private RSMemoryReadout memReadout = new RSMemoryReadout();
        private SongDetails songDetails = new SongDetails();

        //Cache the response
        private JsonResponse jsResp = new JsonResponse();
        private readonly IAddonStorage storage;

        public AddonServiceListener(IPAddress ip, int port, IAddonStorage storage)
        {
            this.storage = storage;

            tcpListener = new TcpListener(ip, port);
            tcpListener.Start();

            listenThread = new Thread(new ThreadStart(Listen));
            listenThread.Start();
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

        private void Listen()
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

        private string GetRequest(Socket s)
        {
            string request = "";

            //Try to receive while socket is connected or there is data to be received
            var buffer = new byte[s.ReceiveBufferSize];
            while (s.Available > 0 || request.Length == 0)
            {
                //Sleep for 10ms
                Thread.Sleep(10);

                s.Receive(buffer);

                request += Encoding.UTF8.GetString(buffer.TakeWhile(x => x > 0).ToArray());

                Array.Clear(buffer, 0, buffer.Length);
            }

            return request;
        }

        private string GetURL(string request)
        {
            int len = request.IndexOf("HTTP/1.1");

            return request.Substring(0, len).Trim();
        }

        private string GetBody(string request)
        {
            return request.Substring(request.IndexOf("\r\n\r\n")).Trim();
        }

        private void ServeClient(Socket s)
        {
            byte[] resp;

            string content = "";

            string request = GetRequest(s);

            if(request.Length <= 0)
            {
                resp = Encoding.UTF8.GetBytes($"HTTP/1.1 500 Internal Server Error\r\nContent-Length: {Encoding.UTF8.GetByteCount(content)}\r\nContent-Type: text/json\r\nAccess-Control-Allow-Methods: *\r\nAccess-Control-Allow-Origin: *\r\n\r\n{ content }\r\n");

                using (var context = new SocketAsyncEventArgs())
                {
                    context.SetBuffer(resp, 0, resp.Length);

                    s.SendAsync(context);
                }

                return;
            }

            string url = GetURL(request);

            if (url.StartsWith("OPTIONS"))
            {
                content = "";
            }
            else if (url.StartsWith("GET /storage/"))
            {
                string[] parts = url.Substring(5).Split('/');

                string addonid = parts[1];
                string key = parts[2];

                content = storage.GetValue(addonid, key) ?? "null";
            }
            else if (url.StartsWith("PUT /storage/"))
            {
                string[] parts = url.Substring(5).Split('/');

                string addonid = parts[1];
                string key = parts[2];

                string value = GetBody(request);

                storage.SetValue(addonid, key, value);

                content = "";
            }
            else
            {
                content = JsonConvert.SerializeObject(jsResp);
            }

            resp = Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {Encoding.UTF8.GetByteCount(content)}\r\nContent-Type: text/json\r\nAccess-Control-Allow-Methods: *\r\nAccess-Control-Allow-Origin: *\r\n\r\n{ content }\r\n");

            using (var context = new SocketAsyncEventArgs())
            {
                context.SetBuffer(resp, 0, resp.Length);

                s.SendAsync(context);
            }
        }
    }
}
