using Newtonsoft.Json;
using RockSnifferLib.Sniffing;
using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Dynamic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace RockSniffer.RPC
{
    class AppleResult
    {
        public string artistName;
        public string collectionName;
        public string trackName;
        public string artworkUrl100;
    }

    class AppleRequestResponse {
        public int resultCount;
        public AppleResult[] results;
    }

    public class AlbumArtResolver
    {
        private HttpClient httpClient = new HttpClient();
        private Dictionary<string, (string URL, string DisplayText)> cache = new Dictionary<string, (string URL, string DisplayText)>();

        /// <summary>
        /// Attempt to obtain album cover
        /// </summary>
        /// <param name="songInfo">Details about the given song</param>
        public (string? URL, string DisplayText) Get(SongDetails songInfo)
        {
            string key = $"{songInfo.artistName}|{songInfo.albumName}";

            // Use double-checked locking pattern, since there are multiple threads
            if (!cache.Keys.Contains(key))
                lock (this)
                    if (!cache.Keys.Contains(key))
                    {
                        //Console.WriteLine($"cache miss on {key}");
                        if (GetFromAppleMusic(songInfo) is (string, string) validResult)
                        {
                            cache[key] = validResult;
                        }
                    }

            return cache.Keys.Contains(key) ? cache[key] : (null, $"{key}");
        }

        /// <summary>
        /// Attempt to obtain album cover from Apple Music
        /// </summary>
        /// <param name="songInfo">Details about the given song</param>
        protected (string URL, string DisplayText)? GetFromAppleMusic(SongDetails songInfo)
        {
            HttpClient httpClient = new HttpClient();
            httpClient.DefaultRequestHeaders.Add("User-Agent", "RockSniffer");

            string baseUrl = "https://itunes.apple.com/search";
            NameValueCollection queryString = System.Web.HttpUtility.ParseQueryString(string.Empty);
            queryString.Add("media", "music");
            queryString.Add("limit", "25");
            queryString.Add("term", $"{songInfo.artistName} {songInfo.songName}");

            var webRequest = new HttpRequestMessage(HttpMethod.Get, baseUrl + "?" + queryString.ToString());

            using (var reader = new StreamReader(httpClient.Send(webRequest).Content.ReadAsStream()))
            {
                if (JsonConvert.DeserializeObject<AppleRequestResponse>(reader.ReadToEnd()) is AppleRequestResponse response)
                {
                    AppleResult? bestResult = null;

                    // Attempt to find a full match, or at least valid result
                    foreach (AppleResult appleResult in response.results)
                    {
                        if (appleResult.artistName != null && appleResult.collectionName != null && appleResult.trackName != null)
                        {
                            if (bestResult == null)
                                bestResult = appleResult;



                            if ((appleResult.artistName.Contains(songInfo.artistName, StringComparison.OrdinalIgnoreCase)
                                 || songInfo.artistName.Contains(appleResult.artistName, StringComparison.OrdinalIgnoreCase))
                                && (appleResult.collectionName.Contains(songInfo.albumName, StringComparison.OrdinalIgnoreCase)
                                    || songInfo.albumName.Contains(appleResult.collectionName, StringComparison.OrdinalIgnoreCase)))
                            {
                                bestResult = appleResult;
                                break;
                            }
                        }
                    }

                    // If bestResult isn't null (is valid result, perhaps even full match), return the URL and description
                    if (bestResult is AppleResult appleResult1)
                    {
                        return (bestResult.artworkUrl100, $"{bestResult.artistName} - {bestResult.collectionName} (fetched from Apple Music)");
                    }
                }

                // Return null in case response had no data or so
                return null;
            };
        }
    }
}
