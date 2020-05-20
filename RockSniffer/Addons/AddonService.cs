using RockSniffer.Addons.Storage;
using RockSniffer.Configuration;
using RockSnifferLib.Sniffing;
using System;
using System.Net;

namespace RockSniffer.Addons
{
    internal class AddonService
    {
        private AddonServiceListener listener;

        public AddonService(AddonSettings settings, IAddonStorage storage)
        {
            if (!IPAddress.TryParse(settings.ipAddress, out IPAddress ip))
            {
                throw new Exception($"IP Address '{settings.ipAddress}' is not valid");
            }

            Console.WriteLine("Starting AddonService listener on {0}:{1}", ip.ToString(), settings.port);

            listener = new AddonServiceListener(ip, settings, storage);
        }

        public void SetSniffer(Sniffer sniffer)
        {
            sniffer.OnSongChanged += listener.OnCurrentSongChanged;
            sniffer.OnMemoryReadout += listener.OnMemoryReadout;
            sniffer.OnStateChanged += listener.OnStateChanged;
        }
    }
}
