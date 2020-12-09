const STATE_NONE = 0;
const STATE_IN_MENUS = 1;
const STATE_SONG_SELECTED = 2;
const STATE_SONG_STARTING = 3;
const STATE_SONG_PLAYING = 4;
const STATE_SONG_ENDING = 5;

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
		//Get accuracy
		var accuracy = this._prevdata.memoryReadout.noteData.Accuracy;

		//Round to decimals
		return parseFloat(accuracy.toFixed(decimals));
	}

	//Get current arrangement
	getCurrentArrangement() {
		if(!this._prevdata) {
			return null;
		}

		if(!this._prevdata.memoryReadout) {
			return null;
		}

		//Look through arrangements for matching ID
		for (var i = this._prevdata.songDetails.arrangements.length - 1; i >= 0; i--) {
			var arrangement = this._prevdata.songDetails.arrangements[i];

			//Check that ID is correctly formatted-32 characters long-to avoid errors
			if(arrangement.arrangementID.length == 32 && arrangement.arrangementID == this._prevdata.memoryReadout.arrangementID) {
				return arrangement;
			}
		}
		
		//If no matching ID, look for arragnement that matches previous path
		for (var i = this._prevdata.songDetails.arrangements.length - 1; i >= 0; i--) {
			var arrangement = this._prevdata.songDetails.arrangements[i];	
			
			if(this.prevPath != null && arrangement.name == this.prevPath  && arrangement.type == this.prevPath  && arrangement.isBonusArrangement == false && arrangement.isAlternateArrangement == false) {
				return arrangement;
			}
		}
		
		//If no previous path, resort to default path listed at top
		for (var i = this._prevdata.songDetails.arrangements.length - 1; i >= 0; i--) {
			var arrangement = this._prevdata.songDetails.arrangements[i];	
			
			if(arrangement.name == defaultPath && arrangement.type == defaultPath && arrangement.isBonusArrangement == false && arrangement.isAlternateArrangement == false) {
				return arrangement;
			}
		}
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
