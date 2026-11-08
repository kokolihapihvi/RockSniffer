using System;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class AddonSettings
    {
        public string NOTE_enableAddons = "Enabling addons will enable a local web server";
        public bool enableAddons = true;
        public string ipAddress = "127.0.0.1";
        public int port = 9938;
        public string NOTE_serveAddons = "Also serve addon files through the local web server";
        public bool serveAddons = true;
    }
}
