using Newtonsoft.Json;
using RockSnifferLib.Logging;
using RockSnifferLib.Sniffing;
using System;
using System.Collections.Concurrent;
using System.Collections.Specialized;
using System.IO;
using System.Net;
using System.Net.Http;

namespace RockSniffer.RPC
{
    public class AlbumArtResolver
    {
        [Serializable]
        private class AppleResult
        {
            public string artistName;
            public string collectionName;
            public string trackName;
            public string artworkUrl100;
        }

        [Serializable]
        private class AppleRequestResponse
        {
            public int resultCount;
            public AppleResult[] results;
        }

        private HttpClient httpClient = new HttpClient();
        private ConcurrentDictionary<string, (string URL, string DisplayText)?> cache = new ConcurrentDictionary<string, (string URL, string DisplayText)?>();


        public AlbumArtResolver() {
            httpClient.DefaultRequestHeaders.Add("User-Agent", "RockSniffer");
        }

        /// <summary>
        /// Attempt to obtain album cover
        /// </summary>
        /// <param name="songInfo">Details about the given song</param>
        public (string URL, string DisplayText)? Get(SongDetails songInfo)
        {
            string key = $"{songInfo.artistName}|{songInfo.albumName}";

            cache.AddOrUpdate(key, (key) => GetFromAppleMusic(songInfo), (key, value) => value);

            return cache[key];
        }

        /// <summary>
        /// Attempt to obtain album cover from Apple Music
        /// </summary>
        /// <param name="songInfo">Details about the given song</param>
        protected (string URL, string DisplayText)? GetFromAppleMusic(SongDetails songInfo)
        {
            string baseUrl = "https://itunes.apple.com/search";
            NameValueCollection queryString = System.Web.HttpUtility.ParseQueryString(string.Empty);
            queryString.Add("media", "music");
            queryString.Add("limit", "25");
            queryString.Add("term", $"{songInfo.artistName} {songInfo.songName}");

            var webRequest = new HttpRequestMessage(HttpMethod.Get, baseUrl + "?" + queryString.ToString());

            HttpResponseMessage responseMessage = httpClient.Send(webRequest);

            if (responseMessage.StatusCode != HttpStatusCode.OK)
                return null;

            using (var reader = new StreamReader(responseMessage.Content.ReadAsStream()))
            {
                // Attempt deserialization, return null on failure
                AppleRequestResponse? responseOpt = null;
                try
                {
                    responseOpt = JsonConvert.DeserializeObject<AppleRequestResponse>(reader.ReadToEnd());
                }
                catch (Exception ex)
                {
                    Logger.LogException(ex);
                    return null;
                }

                if (responseOpt is AppleRequestResponse response)
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
                    if (bestResult is AppleResult bestResultOk)
                    {
                        return (bestResultOk.artworkUrl100, $"{bestResultOk.artistName} - {bestResultOk.collectionName} (art from Apple Music)");
                    }
                }

                // Return null in case response had no data or so
                return null;
            };
        }
    }
}
