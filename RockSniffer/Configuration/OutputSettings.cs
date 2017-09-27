using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class OutputSettings
    {
        public OutputSettings()
        {
            //Convert to array on constructor
            ConvertToArray();
        }

        [JsonIgnore]
        public OutputFile[] output;

        //Have a dictionary for easier configuration via editing json
        public Dictionary<string, string> outputs = new Dictionary<string, string>() {
            { "song_details.txt", "%SONG_ARTIST% - %SONG_NAME%" },
            { "album_details.txt", "%SONG_ALBUM% (%ALBUM_YEAR%)" },
            { "song_timer.txt", "%SONG_TIMER%/%SONG_LENGTH%" },
            { "notes.txt", "%NOTES_HIT%/%TOTAL_NOTES%" },
            { "accuracy.txt", "%CURRENT_ACCURACY%" },
            { "streaks.txt", "%CURRENT_STREAK%/%HIGHEST_STREAK%" }
        };

        //Convert dictionary to array
        private void ConvertToArray()
        {
            List<OutputFile> outputList = new List<OutputFile>();

            //Create OutputFile instance for each output
            foreach (KeyValuePair<string, string> op in outputs)
            {
                outputList.Add(new OutputFile(op.Key, op.Value));
            }

            //Turn list into array
            output = outputList.ToArray();
        }

        [OnDeserialized]
        internal void OnDeserialized(StreamingContext context)
        {
            ConvertToArray();
        }
    }
}
