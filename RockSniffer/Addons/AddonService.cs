using RockSniffer.Addons.Storage;
using RockSnifferLib.Sniffing;
using System;
using System.Net;

namespace RockSniffer.Addons
{
    internal class AddonService
    {
        private AddonServiceListener listener;


        public AddonService(string ipStr, int port, IAddonStorage storage)
        {
            if (!IPAddress.TryParse(ipStr, out IPAddress ip))
            {
                throw new Exception($"IP Address '{ipStr}' is not valid");
            }

            Console.WriteLine("Starting AddonService listener on {0}:{1}", ip.ToString(), port);

            listener = new AddonServiceListener(ip, port, storage);
        }

        public void SetSniffer(Sniffer sniffer)
        {
            sniffer.OnSongChanged += listener.OnCurrentSongChanged;
            sniffer.OnMemoryReadout += listener.OnMemoryReadout;
            sniffer.OnStateChanged += listener.OnStateChanged;
        }
    }
}
