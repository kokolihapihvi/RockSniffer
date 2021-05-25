using Newtonsoft.Json;
using RockSniffer.Addons.Storage;
using RockSniffer.Configuration;
using RockSnifferLib.Events;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using System;
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

            public string Version
            {
                get
                {
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
        private readonly AddonSettings settings;
        private readonly IAddonStorage storage;

        public AddonServiceListener(IPAddress ip, AddonSettings settings, IAddonStorage storage)
        {
            this.settings = settings;
            this.storage = storage;

            tcpListener = new TcpListener(ip, settings.port);
            tcpListener.Start();

            listenThread = new Thread(new ThreadStart(Listen));
            listenThread.Name = "Addon Service Listener";
            listenThread.Start();
        }

        internal void OnCurrentSongChanged(object sender, OnSongChangedArgs args)
        {
            songDetails = args.songDetails;

            jsResp.songDetails = songDetails;
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

                try
                {
                    ServeClient(s);
                }
                catch (SocketException e)
                {
                    Logger.LogError("Unable to serve AddonService client");
                    Logger.LogException(e);
                }
                finally
                {
                    s.Dispose();
                }
            }
        }

        private string GetRequest(Socket s)
        {
            string request = "";

            // Set socket timeout to 2 seconds, so that stalled clients will be disconnected properly
            s.ReceiveTimeout = 2000;

            // Try to receive while socket is connected or there is data to be received
            var buffer = new byte[s.ReceiveBufferSize];
            while (s.Available > 0 || request.Length == 0)
            {
                // Sleep for 10ms
                Thread.Sleep(10);

                int received = s.Receive(buffer);

                request += Encoding.UTF8.GetString(buffer.TakeWhile(x => x > 0).ToArray());

                Array.Clear(buffer, 0, buffer.Length);

                if (received == 0)
                {
                    break;
                }
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
            string request = GetRequest(s);

            if (request.Length <= 0)
            {
                RespondError(s);

                return;
            }

            string url = GetURL(request);

            if (url.StartsWith("OPTIONS"))
            {
                //Empty response
                RespondText(s, "", "text/html");
            }
            else if (url.StartsWith("GET /storage/"))
            {
                string[] parts = url.Substring(5).Split('/');

                string addonid = parts[1];
                string key = parts[2];

                RespondText(s, storage.GetValue(addonid, key) ?? "null", "text/json");
            }
            else if (url.StartsWith("PUT /storage/"))
            {
                string[] parts = url.Substring(5).Split('/');

                string addonid = parts[1];
                string key = parts[2];

                string value = GetBody(request);

                storage.SetValue(addonid, key, value);

                //Empty response
                RespondText(s, "", "text/html");
            }
            else if (url.StartsWith("GET /addons"))
            {
                if (settings.serveAddons)
                {
                    TryServeAddons(s, url);
                }
                else
                {
                    RespondError(s, HttpStatusCode.InternalServerError, "Addon serving is disabled in config/addons.json");
                }
            }
            else
            {
                RespondText(s, JsonConvert.SerializeObject(jsResp), "text/json");
            }

            s.Close();
        }

        private void RespondError(Socket s, HttpStatusCode errorCode = HttpStatusCode.InternalServerError, string message = "Internal Server Error")
        {
            byte[] resp = Encoding.UTF8.GetBytes($"HTTP/1.1 {(int)errorCode} {message}\r\nContent-Length: {Encoding.UTF8.GetByteCount(message)}\r\nContent-Type: text/html\r\nAccess-Control-Allow-Methods: *\r\nAccess-Control-Allow-Origin: *\r\n\r\n{message}\r\n");

            using (var context = new SocketAsyncEventArgs())
            {
                context.SetBuffer(resp, 0, resp.Length);

                s.SendAsync(context);
            }
        }

        private void RespondText(Socket s, string text, string contentType)
        {
            byte[] resp = Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {Encoding.UTF8.GetByteCount(text)}\r\nContent-Type: {contentType}\r\nAccess-Control-Allow-Methods: *\r\nAccess-Control-Allow-Origin: *\r\n\r\n{ text }\r\n");

            using (var context = new SocketAsyncEventArgs())
            {
                context.SetBuffer(resp, 0, resp.Length);

                s.SendAsync(context);
            }
        }

        private void RespondFile(Socket s, string filename, string contentType)
        {
            byte[] fileBytes = File.ReadAllBytes(filename);

            byte[] header = Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {fileBytes.Length}\r\nContent-Type: {contentType}\r\nAccess-Control-Allow-Methods: *\r\nAccess-Control-Allow-Origin: *\r\n\r\n");

            s.Send(header);
            s.Send(fileBytes);
        }

        /// <summary>
        /// This should be ok since we are only serving over localhost or a local area network
        /// Don't look at me like that :/
        /// </summary>
        /// <param name="url"></param>
        /// <param name="content"></param>
        private void TryServeAddons(Socket s, string url)
        {
            // Handle missing addons folder when serving
            if(string.IsNullOrEmpty(AddonService.AddonsPath))
            {
                RespondError(s, HttpStatusCode.InternalServerError, "Addons folder not found");
                return;
            }

            string path = Path.Combine(AddonService.AddonsPath, url.Replace("GET /addons/", ""));

            try
            {

                //Serve file
                if (Path.HasExtension(path))
                {
                    Logger.Log("[AddonService] Serving {0}", path);

                    if (!File.Exists(path))
                    {
                        Logger.LogError("[AddonService] File does not exist");
                        RespondError(s, HttpStatusCode.NotFound, "File Not Found");
                        return;
                    }

                    string contentType = "text/plain";

                    switch (Path.GetExtension(path))
                    {
                        case ".htm":
                        case ".html":
                            contentType = "text/html";
                            break;
                        case ".css":
                            contentType = "text/css";
                            break;
                        case ".js":
                            contentType = "text/javascript";
                            break;
                    }

                    RespondFile(s, path, contentType);
                }
                else //Serve addon index
                {
                    StringBuilder sb = new StringBuilder();
                    sb.Append("<html><head><title>Rocksniffer Addon Index</title></head><body>");

                    sb.Append("<h1>Available Addons:</h1>");

                    sb.Append("<ul>");

                    foreach (string dir in Directory.GetDirectories(AddonService.AddonsPath))
                    {
                        string addon = Path.GetFileName(dir);

                        //Skip the deps folder
                        if (addon.Equals("_deps")) continue;

                        sb.Append($"<li><a href='/addons/{addon}/{addon}.html'>{Path.GetFileName(dir)}</a></li>");
                    }

                    sb.Append("</ul>");


                    sb.Append("</body></html>");

                    RespondText(s, sb.ToString(), "text/html");
                }
            }
            catch (Exception e)
            {
                RespondError(s, HttpStatusCode.InternalServerError, "Unable to serve addons, see console for details");
                Logger.LogError("Unable to serve {0}", url);
                Logger.LogException(e);
            }
        }
    }
}
