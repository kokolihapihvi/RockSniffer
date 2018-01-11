using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.Sniffing;

namespace RockSniffer.Addons
{
    internal class AddonService
    {
        private AddonServiceListener listener;
        private Thread listenThread;

        public AddonService()
        {
            Console.WriteLine("Starting AddonService listener on localhost:9938");

            TcpListener l = new TcpListener(IPAddress.Loopback, 9938);
            l.Start();

            listener = new AddonServiceListener(l);

            listenThread = new Thread(new ThreadStart(listener.Listen));
            listenThread.Start();
        }

        public void SetSniffer(Sniffer sniffer)
        {
            sniffer.OnCurrentSongChanged += listener.OnCurrentSongChanged;
            sniffer.OnMemoryReadout += listener.OnMemoryReadout;
        }
    }
}
