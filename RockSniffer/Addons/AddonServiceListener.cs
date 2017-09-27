using Newtonsoft.Json;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;
using System;
using System.Collections.Generic;
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
            public RSMemoryReadout memoryReadout;
            public SongDetails songDetails;
            public string albumCoverBase64;
        }

        private TcpListener tcpListener;

        internal SongDetails songDetails;
        internal RSMemoryReadout memReadout;

        public AddonServiceListener(TcpListener socket)
        {
            tcpListener = socket;
        }

        public void Listen()
        {
            while (true)
            {
                Socket s = tcpListener.AcceptSocket();

                //We dont need to listen, only spew out data
                /*
                byte[] buffer = new byte[2048];
                int size = s.Receive(buffer);

                for (int i = 0; i < size; i++)
                {
                    Console.Write(Convert.ToChar(buffer[i]));
                }
                */

                JsonResponse jsResp = new JsonResponse();

                if(memReadout != null && songDetails != null)
                {
                    jsResp.success = true;
                    jsResp.memoryReadout = memReadout;
                    jsResp.songDetails = songDetails;

                    if (songDetails.albumArt != null)
                    {
                        using (MemoryStream ms = new MemoryStream())
                        {
                            jsResp.songDetails.albumArt.Save(ms, ImageFormat.Jpeg);
                            jsResp.albumCoverBase64 = Convert.ToBase64String(ms.ToArray());
                        }
                    }
                } else
                {
                    jsResp.success = false;
                }


                string content = JsonConvert.SerializeObject(jsResp);

                byte[] resp = Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Length: {Encoding.UTF8.GetByteCount(content)}\r\nContent-Type: text/json\r\nAccess-Control-Allow-Origin: *\r\n\r\n{ content }\r\n");

                s.Send(resp);

                //s.Close();
            }
        }
    }
}
