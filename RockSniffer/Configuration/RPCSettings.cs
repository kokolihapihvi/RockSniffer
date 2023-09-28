using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class RPCSettings
    {
        public bool enabled = false;
        public uint updatePeriodMs = 1000;
        public string client_id = "573253140682375193";
        public bool enableCoverArt = true;
    }
}
