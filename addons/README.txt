This directory includes addons that come with RockSniffer

If you'd like to make your own, feel free!

Here is how to query the addon service from your addon
Note that this query is written with JQuery, a library found in _deps
The _deps directory contains some common javascript libraries

Also note that the addon service may be disabled by default, see config/addons.json

//This will query data from the addon service
$.getJSON("http://127.0.0.1:9938", function(data) {
	//When the query has completed, this function will run
	//Included in the data object you will find these fields:

	//data.success (boolean)
	//Was the query successful on the addon service side

	//data.albumCoverBase64 (string)
	//The album cover art in base64 encoding, see current_song addon for an example

	//data.memoryReadout (object)
	//The current memory readout data object

	//data.songDetails (object)
	//The current song details object

	//
	//The memory readout object
	//

	//memoryReadout.songTimer (float)
	//The song timer in seconds

	//memoryReadout.songID (string)
	//The current songs ID

	//memoryReadout.totalNotesHit (int)
	//The number of notes hit

	//memoryReadout.currentHitStreak (int)
	//Current hit streak

	//memoryReadout.unknown (int)
	//No idea what this number represents

	//memoryReadout.highestHitStreak (int)
	//The highest the hit streak has reached

	//memoryReadout.totalNotesMissed (int)
	//The number of notes missed in total

	//memoryReadout.currentMissStreak (int)
	//The number of notes missed in a row

	//
	//The song details object
	//

	//songDetails.songID (string)
	//The song ID of the current song

	//songDetails.songName (string)
	//The name of the current song

	//songDetails.artistName (string)
	//The artist name of the current song

	//songDetails.albumName (string)
	//The album name the song is from

	//songDetails.songLength (float)
	//The length of the song, in seconds

	//songDetails.albumYear (int)
	//The year the album was released

	//songDetails.numArrangements (int)
	//The number of arrangements the song has
});
