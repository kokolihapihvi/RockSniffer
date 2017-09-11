using System;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class DebugSettings
    {
        public bool debugSystemHandleQuery = false;
        public bool debugFileDetailQuery = false;
        public bool debugMemoryReadout = false;
        public bool debugSongDetails = false;
        public bool debugCache = false;
        public bool debugHIRCScan = false;
    }
}
