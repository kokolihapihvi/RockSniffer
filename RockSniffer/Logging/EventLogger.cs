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
    /// Appends one line per song start and end to output/events.log, for external
    /// tools that tail the file (scene switching, recording markers). Nothing goes
    /// to the console or sniffer.log.
    /// </summary>
    internal static class EventLogger
    {
        private const string logPath = "output/events.log";

        // Start and end can fire from the readout loop and the state machine loop.
        private static readonly object fileLock = new object();

        private static readonly Encoding utf8NoBom = new UTF8Encoding(false);

        public static void Attach(Sniffer sniffer)
        {
            sniffer.OnSongStarted += OnSongStarted;
            sniffer.OnSongEnded += OnSongEnded;
        }

        private static void OnSongStarted(object? sender, OnSongStartedArgs e)
        {
            SongDetails song = e.song;
            string author = (song.toolkit?.author ?? "").Trim();

            Write(e.timestamp, string.Create(CultureInfo.InvariantCulture,
                $"EVENT=START;artist={song.artistName};album={song.albumName};year={song.albumYear};" +
                $"song={song.songName};length={song.songLength};path={e.path};tuning={e.tuning};author={author};"));
        }

        private static void OnSongEnded(object? sender, OnSongEndedArgs e)
        {
            INoteData? noteData = e.readout?.noteData;

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

        private static void Write(DateTime timestamp, string message)
        {
            string line = $"[{timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture)}] {message}\r\n";

            // These handlers run inside the sniffer's loops; an exception here would
            // abort the rest of that poll, including the run reset after an end.
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
