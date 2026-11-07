using Newtonsoft.Json;
using RockSniffer.Addons.Storage;
using RockSniffer.Configuration;
using RockSnifferLib.Events;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using System;
using System.IO;
using System.Net;
using System.Net.Http;
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

            public string Version => Program.version;
        }

        private HttpListener listener;

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

            listener = new HttpListener();
            listener.Prefixes.Add($"http://{ip}:{settings.port}/");
            listener.Start();

            listenThread = new Thread(Listen)
            {
                Name = "Addon Service Listener"
            };
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
                var context = listener.GetContext();

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
                    ServeClient(context);
                }
                catch (Exception e)
                {
                    Logger.LogError("Unable to serve AddonService client");
                    Logger.LogException(e);
                }
            }
        }

        private void ServeClient(HttpListenerContext context)
        {
            var request = context.Request;
            using var response = context.Response;
            response.AddHeader("Access-Control-Allow-Methods", "*");
            response.AddHeader("Access-Control-Allow-Origin", "*");

            try
            {
                var method = HttpMethod.Parse(request.HttpMethod);
                // Handle OPTIONS requests before anything
                if (method == HttpMethod.Options)
                {
                    RespondWithCode(response,  HttpStatusCode.NoContent);
                    return;
                }
                
                var url = request.Url;
                if (url is null)
                {
                    RespondWithCode(response, HttpStatusCode.InternalServerError, "Missing url");
                    return;
                }

                var path = url.AbsolutePath;

                if (path.StartsWith("/storage/"))
                {
                    string[] parts = path.Substring("/storage/".Length).TrimEnd('/').Split('/');

                    if (parts.Length != 2)
                    {
                        RespondWithCode(response, HttpStatusCode.BadRequest, "Invalid storage path");
                        return;
                    }

                    string addonId = parts[0];
                    string key = parts[1];

                    if (method == HttpMethod.Get)
                    {
                        try
                        {
                            var storedValue = storage.GetValue(addonId, key) ?? "null";
                            RespondText(response, storedValue, "text/json");
                        }
                        catch (ArgumentException)
                        {
                            RespondWithCode(response,  HttpStatusCode.BadRequest, "Invalid addon storage id");
                        }
                    }
                    else if (method == HttpMethod.Put)
                    {
                        var value = "";
                        if (request.HasEntityBody)
                        {
                            using var reader = new StreamReader(request.InputStream);
                            value = reader.ReadToEnd();
                        }
                        
                        try
                        {
                            storage.SetValue(addonId, key, value);
                            RespondWithCode(response, HttpStatusCode.NoContent);
                        }
                        catch (ArgumentException)
                        {
                            RespondWithCode(response, HttpStatusCode.BadRequest, "Invalid addon storage id");
                        }
                    }
                    else
                    {
                        RespondWithCode(response,  HttpStatusCode.MethodNotAllowed, "Method not allowed");
                    }
                }
                else if (method == HttpMethod.Get && path.StartsWith("/addons"))
                {
                    if (settings.serveAddons)
                    {
                        TryServeAddons(response, path);
                    }
                    else
                    {
                        RespondWithCode(response, HttpStatusCode.InternalServerError, "Addon serving is disabled in config/addons.json");
                    }
                }
                else
                {
                    RespondText(response, JsonConvert.SerializeObject(jsResp), "text/json");
                }
            }
            catch (Exception)
            {
                RespondWithCode(response, HttpStatusCode.InternalServerError, "An error occurred while serving this request, refer to the console/log file for more details.");
                throw;
            }
        }

        private void RespondWithCode(HttpListenerResponse response, HttpStatusCode statusCode, string body = "")
        {
            var resp = Encoding.UTF8.GetBytes(body);

            response.StatusCode = (int)statusCode;
            Respond(response, resp, "text/html");
        }

        private void RespondText(HttpListenerResponse response, string text, string contentType)
        {
            var resp = Encoding.UTF8.GetBytes(text);

            Respond(response, resp, contentType);
        }

        private void RespondFile(HttpListenerResponse response, string filename, string contentType)
        {
            var fileBytes = File.ReadAllBytes(filename);

            Respond(response, fileBytes, contentType);
        }

        private void Respond(HttpListenerResponse response, byte[] content, string contentType)
        {
            response.ContentType = contentType;
            response.ContentLength64 = content.Length;
            response.OutputStream.Write(content, 0, content.Length);
        }

        /// <summary>
        /// This should be ok since we are only serving over localhost or a local area network
        /// Don't look at me like that :/
        /// </summary>
        /// <param name="response"></param>
        /// <param name="requestPath"></param>
        private void TryServeAddons(HttpListenerResponse response, string requestPath)
        {
            // Handle missing addons folder when serving
            if(string.IsNullOrEmpty(AddonService.AddonsPath))
            {
                RespondWithCode(response, HttpStatusCode.InternalServerError, "Addons folder not found");
                return;
            }

            // Get absolute path to addons directory
            var addonsDirectory = Path.GetFullPath(AddonService.AddonsPath);
            // Ensure addons directory path has a trailing path separator
            addonsDirectory = Path.TrimEndingDirectorySeparator(addonsDirectory) + Path.DirectorySeparatorChar;
            
            // Unescape the request url
            var requestedPath = Uri.UnescapeDataString(requestPath);

            // Request url must be based on addons directory
            if (!(requestedPath == "/addons" || requestedPath.StartsWith("/addons/")))
            {
                RespondWithCode(response,  HttpStatusCode.NotFound, "Folder not found");
                return;
            }

            requestedPath = requestedPath.Substring("/addons".Length).TrimStart('/');
            
            // Try to make request url based on absolute addons directory
            var requestedFilePath = Path.Combine(addonsDirectory, requestedPath);
            requestedFilePath = Path.GetFullPath(requestedFilePath);

            // If result is not based on absolute addons directory, deny the request
            if (!requestedFilePath.StartsWith(addonsDirectory, StringComparison.OrdinalIgnoreCase))
            {
                RespondWithCode(response, HttpStatusCode.Forbidden, "Forbidden");
                return;
            }

            try
            {
                //Serve file
                if (Path.HasExtension(requestedFilePath))
                {
                    Logger.Log("[AddonService] Serving {0}", requestedFilePath);

                    if (!File.Exists(requestedFilePath))
                    {
                        Logger.LogError("[AddonService] File does not exist");
                        RespondWithCode(response, HttpStatusCode.NotFound, "File Not Found");
                        return;
                    }

                    var contentType = Path.GetExtension(requestedFilePath) switch
                    {
                        ".htm" or ".html" => "text/html",
                        ".css" => "text/css",
                        ".js" => "text/javascript",
                        ".jpg" or ".jpeg" => "image/jpeg",
                        ".png" => "image/png",
                        _ => "text/plain"
                    };

                    RespondFile(response, requestedFilePath, contentType);
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

                    RespondText(response, sb.ToString(), "text/html");
                }
            }
            catch (Exception e)
            {
                RespondWithCode(response, HttpStatusCode.InternalServerError, "Unable to serve addons, see console for details");
                Logger.LogError("Unable to serve {0}", requestPath);
                Logger.LogException(e);
            }
        }
    }
}
