using System;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class OutputFile
    {
        public string filename;
        public string format;

        public OutputFile(string filename, string format)
        {
            this.filename = filename;
            this.format = format;
        }
    }
}
