using System;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class AddonSettings
    {
        public string _NOTE = "Enabling addons will enable a local web server";
        public bool enableAddons = true;
        public string ipAddress = "127.0.0.1";
        public int port = 9938;
        public string _NOTE2 = "Serving addons through the local web server might be unsafe!";
        public bool serveAddons = false;
    }
}
