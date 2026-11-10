using RockSnifferLib.Events;
using RockSnifferLib.Logging;
using RockSnifferLib.RSHelpers;
using RockSnifferLib.RSHelpers.NoteData;
using RockSnifferLib.Sniffing;
using System;
using System.Globalization;
using System.IO;
using System.Text;

namespace RockSniffer.Logging
{
    /// <summary>
    /// Reports song start, pause, resume and end on the console and in sniffer.log,
    /// and optionally as key=value lines in output/events.log for other tools
    /// </summary>
    internal static class EventLogger
    {
        private const string logPath = "output/events.log";

        // Events come from both the readout loop and the state machine loop
        private static readonly object fileLock = new object();

        private static readonly Encoding utf8NoBom = new UTF8Encoding(false);

        private static bool writeFile;

        // State changes carry no readout or song
        private static RSMemoryReadout? lastReadout;
        private static SongDetails? currentSong;

        public static void Attach(Sniffer sniffer, bool writeEventLog)
        {
            writeFile = writeEventLog;

            sniffer.OnMemoryReadout += (sender, e) => lastReadout = e.memoryReadout;
            sniffer.OnStateChanged += OnStateChanged;
            sniffer.OnSongStarted += OnSongStarted;
            sniffer.OnSongEnded += OnSongEnded;
        }

        private static void OnStateChanged(object? sender, OnStateChangedArgs e)
        {
            // Quit and restart from pause go to IN_MENUS, so these are only pause and resume
            bool pause = e.oldState == SnifferState.SONG_PLAYING && e.newState == SnifferState.SONG_PAUSED;
            bool resume = e.oldState == SnifferState.SONG_PAUSED && e.newState == SnifferState.SONG_PLAYING;

            if (!pause && !resume)
            {
                return;
            }

            float timer = lastReadout?.songTimer ?? 0;

            Logger.Log("Song {0} at {1}", pause ? "paused" : "resumed", FormatTimer(timer));

            Write(DateTime.Now, string.Create(CultureInfo.InvariantCulture,
                $"EVENT={(pause ? "PAUSE" : "RESUME")};song={currentSong?.songName};timer={Math.Round(timer, 3)};"));
        }

        private static void OnSongStarted(object? sender, OnSongStartedArgs e)
        {
            SongDetails song = e.song;
            currentSong = song;
            string author = (song.toolkit?.author ?? "").Trim();

            Logger.Log("Song started: {0} - {1} [{2}]", song.artistName, song.songName, e.path);

            Write(e.timestamp, string.Create(CultureInfo.InvariantCulture,
                $"EVENT=START;artist={song.artistName};album={song.albumName};year={song.albumYear};" +
                $"song={song.songName};length={song.songLength};path={e.path};tuning={e.tuning};author={author};"));
        }

        private static void OnSongEnded(object? sender, OnSongEndedArgs e)
        {
            INoteData? noteData = e.readout?.noteData;

            if (e.completed)
            {
                if (noteData != null)
                {
                    Logger.Log("Song ended: completed, {0}%", Math.Round(noteData.Accuracy, 1).ToString(CultureInfo.InvariantCulture));
                }
                else
                {
                    Logger.Log("Song ended: completed");
                }
            }
            else
            {
                Logger.Log("Song ended: quit at {0}", FormatTimer(e.readout?.songTimer ?? 0));
            }

            string line = string.Create(CultureInfo.InvariantCulture,
                $"EVENT=END;completed={e.completed};paused={e.paused};");

            if (noteData != null)
            {
                line += string.Create(CultureInfo.InvariantCulture,
                    $"accuracy={Math.Round(noteData.Accuracy, 1)}%;totalNotes={noteData.TotalNotes};" +
                    $"notesHit={noteData.TotalNotesHit};highestStreak={noteData.HighestHitStreak};");
            }

            if (e.readout?.mode == RSMode.SCOREATTACK && noteData is ScoreAttackNoteData sa)
            {
                line += string.Create(CultureInfo.InvariantCulture,
                    $"Mode=true;TotalPerfectHits={sa.TotalPerfectHits};PerfectPhrases={sa.PerfectPhrases};" +
                    $"GoodPhrases={sa.GoodPhrases};PassedPhrases={sa.PassedPhrases};FailedPhrases={sa.FailedPhrases};" +
                    $"HighestPerfectPhraseStreak={sa.HighestPerfectPhraseStreak};HighestGoodPhraseStreak={sa.HighestGoodPhraseStreak};" +
                    $"HighestPassedPhraseStreak={sa.HighestPassedPhraseStreak};HighestFailedPhraseStreak={sa.HighestFailedPhraseStreak};" +
                    $"CurrentScore={sa.CurrentScore};HighestMultiplier={sa.HighestMultiplier};");
            }

            Write(e.timestamp, line);
        }

        private static string FormatTimer(float seconds)
        {
            int total = (int)Math.Max(0, seconds);
            return $"{total / 60}:{total % 60:00}";
        }

        private static void Write(DateTime timestamp, string message)
        {
            if (!writeFile)
            {
                return;
            }

            string line = $"[{timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture)}] {message}\r\n";

            // An exception here would abort the rest of the sniffer's poll
            try
            {
                lock (fileLock)
                {
                    File.AppendAllText(logPath, line, utf8NoBom);
                }
            }
            catch (Exception ex)
            {
                Logger.LogError("Could not write {0}: {1}", logPath, ex.Message);
            }
        }
    }
}
