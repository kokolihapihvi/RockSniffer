using RockSnifferLib.Sniffing;
using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;

namespace RockSniffer.Addons
{
    internal class AddonService
    {
        private AddonServiceListener listener;
        private Thread listenThread;

        public AddonService(string ipStr, int port)
        {
            if (!IPAddress.TryParse(ipStr, out IPAddress ip))
            {
                throw new Exception($"IP Address '{ipStr}' is not valid");
            }

            Console.WriteLine("Starting AddonService listener on {0}:{1}", ip.ToString(), port);

            TcpListener l = new TcpListener(ip, port);
            l.Start();

            listener = new AddonServiceListener(l);

            listenThread = new Thread(new ThreadStart(listener.Listen));
            listenThread.Start();
        }

        public void SetSniffer(Sniffer sniffer)
        {
            sniffer.OnSongChanged += listener.OnCurrentSongChanged;
            sniffer.OnMemoryReadout += listener.OnMemoryReadout;
            sniffer.OnStateChanged += listener.OnStateChanged;
        }
    }
}
