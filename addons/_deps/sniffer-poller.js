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

		this.callbacks = {
			onData: [],
			onSongChanged: [],
			onSongStarted: [],
			onSongEnded: [],
			onStateChanged: []
		}
	}

	onData(f) {
		this.callbacks.onData.push(f);
	}
	_doOnData(data) {
		this.options.onData(data);

		for (var i = this.callbacks.onData.length - 1; i >= 0; i--) {
			this.callbacks.onData[i](data);
		}
	}

	onSongChanged(f) {
		this.callbacks.onSongChanged.push(f);
	}
	_doOnSongChanged(song) {
		this.options.onSongChanged(song);

		for (var i = this.callbacks.onSongChanged.length - 1; i >= 0; i--) {
			this.callbacks.onSongChanged[i](song);
		}
	}

	onSongStarted(f) {
		this.callbacks.onSongStarted.push(f);
	}
	_doOnSongStarted(song) {
		this.options.onSongStarted(song);

		for (var i = this.callbacks.onSongStarted.length - 1; i >= 0; i--) {
			this.callbacks.onSongStarted[i](song);
		}
	}

	onSongEnded(f) {
		this.callbacks.onSongEnded.push(f);
	}
	_doOnSongEnded(song) {
		this.options.onSongEnded(song);

		for (var i = this.callbacks.onSongEnded.length - 1; i >= 0; i--) {
			this.callbacks.onSongEnded[i](song);
		}
	}

	onStateChanged(f) {
		this.callbacks.onStateChanged.push(f);
	}
	_doOnStateChanged(oldState, newState) {
		this.options.onStateChanged(oldState, newState);

		for (var i = this.callbacks.onStateChanged.length - 1; i >= 0; i--) {
			this.callbacks.onStateChanged[i](oldState, newState);
		}
	}


	gotData(data) {
		//If we have no previous data, fire all events
		if(!this._prevdata) {
			this._doOnStateChanged(STATE_NONE, data.currentState);
			this._doOnSongChanged(data.songDetails);

			this._prevdata = data;
			this._doOnData(data);

			return;
		}

		if(this._prevdata.currentState != data.currentState) {
			this._doOnStateChanged(this._prevdata.currentState, data.currentState);

			if(this._prevdata.currentState == STATE_SONG_ENDING && data.currentState == STATE_IN_MENUS) {
				this._doOnSongEnded(data.songDetails);
			}

			if(data.currentState == STATE_IN_MENUS) {
				this.songStarted = false;
			}
		}

		if(this._prevdata.songDetails && data.songDetails && this._prevdata.songDetails.songID != data.songDetails.songID) {
			this._doOnSongChanged(data.songDetails);
		}

		//Don't fire song started before we have a valid arrangement
		if(!this.songStarted) {
			if(data.currentState == STATE_SONG_STARTING || data.currentState == STATE_SONG_PLAYING) {
				if(this.getCurrentArrangement() != null) {
					this.songStarted = true;
					this._doOnSongStarted(data.songDetails);
				}
			}
		}


		this._prevdata = data;
		this._doOnData(data);
	}

	getCurrentReadout() {
		return this._prevdata.memoryReadout;
	}

	getCurrentSong() {
		return this._prevdata.songDetails;
	}

	getCurrentState() {
		return this._prevdata.currentState;
	}

	getSongTimer() {
		return this._prevdata.memoryReadout.songTimer;
	}

	getCurrentAccuracy(decimals = 2) {
		//Get accuracy
		var accuracy = this._prevdata.memoryReadout.noteData.Accuracy;

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
		return this.getSectionAt(this.getSongTimer());
	}

	getSectionAt(time) {
		var arrangement = this.getCurrentArrangement();

		if(!arrangement) {
			return null;
		}

		for (var i = arrangement.sections.length-1; i >= 0; i--) {
			var section = arrangement.sections[i];
			section.index = i;

			if(time > section.startTime) {
				return section;
			}
		}

		return arrangement.sections[0];
	}

	poll() {
		$.getJSON("http://"+this.options.ip+":"+this.options.port, (data) => this.gotData(data));
	}

	stop() {
		clearInterval(this.polltimer);
	}
}