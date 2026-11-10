// currentState is serialized as the SnifferState name
const STATE_NONE = "NONE";
const STATE_IN_MENUS = "IN_MENUS";
const STATE_SONG_SELECTED = "SONG_SELECTED";
const STATE_SONG_STARTING = "SONG_STARTING";
const STATE_SONG_PLAYING = "SONG_PLAYING";
const STATE_SONG_ENDING = "SONG_ENDING";

class SnifferPoller {
	//Create variables and containers for poller data.
	constructor(options = {}) {
		var defaultOptions = {
			ip: ip,
			port: port,
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

	//Trigger for onData
	onData(f) {
		this.callbacks.onData.push(f);
	}
	
	//Event triggers for onData
	_doOnData(data) {
		this.options.onData(data);

		for (var i = this.callbacks.onData.length - 1; i >= 0; i--) {
			this.callbacks.onData[i](data);
		}
	}

	//Trigger for song change
	onSongChanged(f) {
		this.callbacks.onSongChanged.push(f);
	}
	
	//Event triggers for song change
	_doOnSongChanged(song) {
		this.options.onSongChanged(song);

		for (var i = this.callbacks.onSongChanged.length - 1; i >= 0; i--) {
			this.callbacks.onSongChanged[i](song);
		}
	}

	//Trigger for song start
	onSongStarted(f) {
		this.callbacks.onSongStarted.push(f);
	}
	
	//Event triggers for song start
	_doOnSongStarted(song) {
		this.options.onSongStarted(song);

		for (var i = this.callbacks.onSongStarted.length - 1; i >= 0; i--) {
			this.callbacks.onSongStarted[i](song);
		}
	}

	//Event triggers for song end
	onSongEnded(f) {
		this.callbacks.onSongEnded.push(f);
	}
	
	//Event triggers for song end
	_doOnSongEnded(song) {
		this.options.onSongEnded(song);

		for (var i = this.callbacks.onSongEnded.length - 1; i >= 0; i--) {
			this.callbacks.onSongEnded[i](song);
		}
	}

	//Set up event triggers
	onStateChanged(f) {
		this.callbacks.onStateChanged.push(f);
	}
	
	//Event triggers when game state changes
	_doOnStateChanged(oldState, newState) {
		this.options.onStateChanged(oldState, newState);

		for (var i = this.callbacks.onStateChanged.length - 1; i >= 0; i--) {
			this.callbacks.onStateChanged[i](oldState, newState);
		}
	}

	//Set event triggers when data
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

			//Use the song that just ended, data may already be on the next one
			if(this._prevdata.currentState == STATE_SONG_ENDING && data.currentState == STATE_IN_MENUS) {
				if(this.songStarted) {
					this._doOnSongEnded(this._prevdata.songDetails);
					this.songStarted = false;
				}
			}

			if(data.currentState == STATE_IN_MENUS) {
				this.songStarted = false;
			}
		}

		//In Nonstop Play the state can skip IN_MENUS between songs, so a songID change also ends the song
		if(this._prevdata.songDetails && data.songDetails && this._prevdata.songDetails.songID != data.songDetails.songID) {
			if(this.songStarted) {
				this._doOnSongEnded(this._prevdata.songDetails);
				this.songStarted = false;
			}
			this._doOnSongChanged(data.songDetails);
		}

		//Before the song start check: getCurrentArrangement reads _prevdata
		this._prevdata = data;

		//Don't fire song started before we have a valid arrangement.
		//SONG_ENDING too: Nonstop Play can stay in it for the whole next song
		if(!this.songStarted) {
			if(data.currentState == STATE_SONG_STARTING || data.currentState == STATE_SONG_PLAYING || data.currentState == STATE_SONG_ENDING) {
				if(this.getCurrentArrangement() != null) {
					this.songStarted = true;
					this._doOnSongStarted(data.songDetails);
				}
			}
		}

		this._doOnData(data);
	}

	//Get current data
	getCurrentReadout() {
		return this._prevdata.memoryReadout;
	}

	//Get current song
	getCurrentSong() {
		return this._prevdata.songDetails;
	}

	//Get current game state
	getCurrentState() {
		return this._prevdata.currentState;
	}

	//Get song timer
	getSongTimer() {
		return this._prevdata.memoryReadout.songTimer;
	}

	//Get current accuract
	getCurrentAccuracy(decimals = 2) {
		// noteData is null between songs
		if(!this._prevdata || !this._prevdata.memoryReadout || !this._prevdata.memoryReadout.noteData) {
			return 0;
		}
		var accuracy = this._prevdata.memoryReadout.noteData.Accuracy;
		if(accuracy == null) {
			return 0;
		}

		//Round to decimals
		return parseFloat(accuracy.toFixed(decimals));
	}

	//Get current arrangement, or null
	getCurrentArrangement() {
		if(!this._prevdata) {
			return null;
		}
		return this.resolveArrangement(this._prevdata.songDetails, this._prevdata.memoryReadout);
	}

	//Find the arrangement by ID, else by the selected Path, preferring the main
	//arrangement over bonus and alternate ones. Addons pass the song they display,
	//which can differ from the current one while showing results.
	resolveArrangement(songDetails, memoryReadout) {
		if(!memoryReadout) {
			return null;
		}

		if(!songDetails || !songDetails.arrangements) {
			return null;
		}

		var arrangements = songDetails.arrangements;

		for (var i = arrangements.length - 1; i >= 0; i--) {
			var arrangement = arrangements[i];

			if(arrangement.arrangementID && arrangement.arrangementID.length == 32 &&
			   arrangement.arrangementID == memoryReadout.arrangementID) {
				return arrangement;
			}
		}

		var currentPath = memoryReadout.currentPath;
		if (currentPath && currentPath !== "Unknown") {
			for (var i = 0; i < arrangements.length; i++) {
				var arr = arrangements[i];
				if((arr.type == currentPath || arr.name == currentPath) &&
				   arr.isBonusArrangement == false && arr.isAlternateArrangement == false) {
					return arr;
				}
			}
			for (var i = 0; i < arrangements.length; i++) {
				var arr = arrangements[i];
				if(arr.type == currentPath || arr.name == currentPath) {
					return arr;
				}
			}
		}

		return null;
	}

	// Keeps the results view (app.mode 1) up for one pass through app.feedback, since
	// in Nonstop Play the next song loads right away. Starting a song skips the wait.
	// Call resultsHold.markShown() when switching to mode 1.
	enableResultsHold(app, options) {
		options = options || {};
		var cycleMs = options.cycleMs || 5000;
		var shownAt = 0;
		var pendingTimer = null;

		var flip = function (force) {
			if (pendingTimer) {
				clearTimeout(pendingTimer);
				pendingTimer = null;
			}
			app.visible = true;
			if (app.mode !== 1) {
				app.mode = 0;
				return;
			}
			var minHoldMs = ((app.feedback || []).length || 1) * cycleMs;
			var elapsed = Date.now() - shownAt;
			if (force || elapsed >= minHoldMs) {
				app.mode = 0;
			} else {
				pendingTimer = setTimeout(function () {
					app.mode = 0;
					pendingTimer = null;
				}, minHoldMs - elapsed);
			}
		};

		this.resultsHold = {
			flip: flip,
			markShown: function () { shownAt = Date.now(); }
		};

		this.callbacks.onSongStarted.push(function () { flip(false); });
		this.callbacks.onSongChanged.push(function () { flip(false); });
		this.callbacks.onStateChanged.push(function (oldState, newState) {
			if (newState === STATE_SONG_SELECTED ||
			    newState === STATE_SONG_STARTING ||
			    newState === STATE_SONG_PLAYING) {
				flip(true);
			}
		});

		return this.resultsHold;
	}

	//Get section at current time
	getCurrentSection() {
		return this.getSectionAt(this.getSongTimer());
	}

	//Get section at specific time
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
	
	//Get phrase at current time
	getCurrentPhrase() {
		return this.getPhraseAt(this.getSongTimer());
	}
	
	//Get phrase at specific time
	getPhraseAt(time) {
		var arrangement = this.getCurrentArrangement();

		if(!arrangement) {
			return null;
		}

		for (var i = arrangement.phraseIterations.length-1; i >= 0; i--) {
			var phrase = arrangement.phraseIterations[i];
			phrase.index = i;

			if(time > phrase.startTime) {
				return phrase;
			}
		}

		return arrangement.phraseIterations[0];
	}
	
	//get Maximum Difficulty from an arrangement
	getMaxDif(){
		var arrangement = this.getCurrentArrangement();
		if(!arrangement) {
			return 0;
		}
		var maxDif = 0;			
		for (var i = 0; i < arrangement.phraseIterations.length; i++) { 
			var phrase = arrangement.phraseIterations[i];
			if(phrase.maxDifficulty > maxDif){
				maxDif = phrase.maxDifficulty;					
			}
		}	
		return maxDif;
	}

	poll() {
		$.getJSON("http://"+this.options.ip+":"+this.options.port, (data) => this.gotData(data));
	}

	stop() {
		clearInterval(this.polltimer);
	}
}
