const STATE_NONE = 0;
const STATE_IN_MENUS = 1;
const STATE_SONG_SELECTED = 2;
const STATE_SONG_STARTING = 3;
const STATE_SONG_PLAYING = 4;
const STATE_SONG_ENDING = 5;

class SnifferPoller {
	constructor(options = {}) {
		var defaultOptions = {
			ip: "127.0.0.1",
			port: "9938",
			interval: 900,

			onData: (data) => {},
			onSongChanged: (songData) => {console.log("onSongChanged",songData)},
			onSongStarted: (songData) => {console.log("onSongStarted",songData)},
			onSongEnded: (songData) => {console.log("onSongEnded",songData)},
			onStateChanged: (oldState, newState) => {console.log("onStateChanged",oldState+"=>"+newState)}
		}

		//Set up options
		this.options = {}
		$.extend(this.options, defaultOptions, options);

		//Poll interval
		this.polltimer = setInterval(() => this.poll(), this.options.interval);

		//Some internal state variables
		this.songStarted = false;
	}

	gotData(data) {
		//If we have no previous data, fire all events
		if(!this._prevdata) {
			this.options.onStateChanged(STATE_NONE, data.currentState);
			this.options.onSongChanged(data.songDetails);

			this._prevdata = data;
			this.options.onData(data);

			return;
		}

		if(this._prevdata.currentState != data.currentState) {
			this.options.onStateChanged(this._prevdata.currentState, data.currentState);

			if(this._prevdata.currentState == STATE_SONG_ENDING && data.currentState == STATE_IN_MENUS) {
				this.options.onSongEnded(data.songDetails);
				this.songStarted = false;
			}
		}

		if(this._prevdata.songDetails && data.songDetails && this._prevdata.songDetails.songID != data.songDetails.songID) {
			this.options.onSongChanged(data.songDetails);
		}

		//Don't fire song started before we have a valid arrangement
		if(!this.songStarted) {
			if(data.currentState == STATE_SONG_STARTING || data.currentState == STATE_SONG_PLAYING) {
				if(this.getCurrentArrangement() != null) {
					this.options.onSongStarted(data.songDetails);
					this.songStarted = true;
				}
			}
		}


		this._prevdata = data;
		this.options.onData(data);
	}

	getCurrentState() {
		return this._prevdata.currentState;
	}

	getSongTimer() {
		return this._prevdata.memoryReadout.songTimer;
	}

	getCurrentAccuracy(decimals = 2) {
		//Calculate percentage (notes hit / notes hit + notes missed)
		var accuracy = this._prevdata.memoryReadout.totalNotesHit / (this._prevdata.memoryReadout.totalNotesHit + this._prevdata.memoryReadout.totalNotesMissed);
		accuracy *= 100;

		//If the accuracy is not a number, set it to 100
		if(isNaN(accuracy)) {
			accuracy = 100;
		}

		//Round to decimals
		return parseFloat(accuracy.toFixed(decimals));
	}

	getCurrentArrangement() {
		if(!this._prevdata) {
			return null;
		}

		if(!this._prevdata.memoryReadout) {
			return null;
		}

		if(!this._prevdata.memoryReadout.arrangementID) {
			return null;
		}

		for (var i = this._prevdata.songDetails.arrangements.length - 1; i >= 0; i--) {
			var arrangement = this._prevdata.songDetails.arrangements[i];

		 	if(arrangement.arrangementID == this._prevdata.memoryReadout.arrangementID) {
		 		return arrangement;
		 	}
		 }
	}

	getCurrentSection() {
		var arrangement = this.getCurrentArrangement();

		if(!arrangement) {
			return null;
		}

		for (var i = 0; i < arrangement.sections.length; i++) {
			var section = arrangement.sections[i];

			if(this.getSongTimer() > section.startTime) {
				return section;
			}
		}

		return {
			startTime: 0,
			endTime: 0,
			name: "unknown"
		};
	}

	poll() {
		$.getJSON("http://"+this.options.ip+":"+this.options.port, (data) => this.gotData(data));
	}

	stop() {
		clearInterval(this.polltimer);
	}
}