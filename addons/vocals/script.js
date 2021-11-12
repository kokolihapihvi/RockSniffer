let poller = new SnifferPoller({
	
	// Polling interval in ms
	interval: 30,
	
	// Latency compensation in second
	// If the lyrics are displayed with a delay, this value must be increased
	// It depends on the power of your PC and the usage of your network
	latencyCompensation: 0.250,

	// Time in second for display vocal before lyric start
	preVocalDisplayTime: 2,
	// Time in second for display vocal after lyric end
	postVocalDisplayTime: 0.7,
	// Number of line displayed, This value can be exceeded when it sings fast
	numberOfLinesDisplayed: 2,
	
	// Max note kepping, Use for compatibility with bad length of vocal
	maxNoteKepping: 2.5,

	// HTML / CSS customization
	beginLyric: '<span class="lyric">',
	endLyric: '</span>',
	newLine: '<br>',

	onData: function(data) {
		
		// Not in song
		if (data.currentState != STATE_SONG_PLAYING) {
			$(".vocal").html("");
			return;
		}
		
		let currentTime = data.memoryReadout.songTimer + this.latencyCompensation;
		let vocals = data.songDetails.vocals;
		
		// Song not started or song without vocals
		if (currentTime <= 0 || vocals == null) {
			$(".vocal").html("");
			return;
		}

		// Vocals exist but is empty
		let vocalsLength = vocals.length;
		if (vocalsLength <= 0) {
			$(".vocal").html("");
			return;
		}
		
		// Search pre index. Only for performance
		let part = vocalsLength / 2;
		let index = Math.floor(part);
		while (true) {
			part /= 2;
			if (vocals[index].Time <= currentTime) {
				index = Math.floor(index + part);
				
			} else if (vocals[index].Time > currentTime) {
				index = Math.floor(index - part);
			}
			if (part <= 2 || index <= 0 || index >= vocalsLength) {
				break;
			}
		}
		// Start 40 syllables before current vocal
		// 30 is not enought for japanese language
		index -= 40;
		if (index <= 0) {
			index = 0;
		}

		// State
		let isNextNewLine;
		let isNextWithoutSpace;
		let isEndOfCurrent = false;
		let isNewLineBefore = false;
		let stopAtNextLine = false;

		let vocal;
		let lyric;
		let noteKeeping;
		let timeDifference;
		let currentLine = this.beginLyric;
		let lineNumber = 1;

		const regExStartWithUpperCaseChar = /[A-Z]/;
		
		// TODO don't create a new line when it's start whith "I " or "I'" and the preceded word have a majuscule
		// only in two compatibility process
		
		for (; index < vocalsLength; ++index) {

			// Get state from vocal
			vocal = vocals[index];
			lyric = vocal.Lyric;
			noteKeeping = vocal.Length;
			if (noteKeeping > this.maxNoteKepping) {
				noteKeeping = this.maxNoteKepping;
			}
			
			isNextNewLine = false;
			isNextWithoutSpace = false;
			if (lyric.endsWith("-")) {
				isNextWithoutSpace = true;
			} else if (lyric.endsWith("+")) {
				isNextNewLine = true;
			}
			
			// Remove vocal state from lyric
			if (isNextWithoutSpace || isNextNewLine) {
				lyric = lyric.substr(0, lyric.length-1);
			}
			
			timeDifference = currentTime - vocal.Time;
			if (timeDifference >= 0) {
				
				// Compatibility with Rocksmith song without state in vocal
				if (regExStartWithUpperCaseChar.test(lyric.substr(0, 1))) {
					if (!currentLine.endsWith(this.newLine) && currentLine != this.beginLyric) {
						isNewLineBefore = false;
						currentLine = this.beginLyric;
						lineNumber = 1;
					}
				}

				// Do not display vocals too early
				if (timeDifference + this.preVocalDisplayTime < 0) {
					if (currentLine == this.beginLyric || currentLine.endsWith(this.newLine)) {
						break;
					}
					stopAtNextLine = true;
				}

				// Vocal before current time
				currentLine = currentLine + lyric;
				if (isNextNewLine) {
					// If new line exist before or current vocal is during a lyric who was not terminated
					// and when is finish display a post time defined
					if ((isNewLineBefore || (timeDifference - noteKeeping) >= 0) && (timeDifference - noteKeeping - this.postVocalDisplayTime) >= 0) {
						isNewLineBefore = false;
						currentLine = this.beginLyric;
						lineNumber = 1;
					} else {
						if (stopAtNextLine) {
							break;
						}
						isNewLineBefore = true;
						currentLine += this.newLine;
						++lineNumber;
					}
				} else if (!isNextWithoutSpace) {
					currentLine += ' ';
				}

			} else {
				// Compatibility with Rocksmith song without state in vocal
				if (regExStartWithUpperCaseChar.test(lyric.substr(0, 1))) {
					if (!currentLine.endsWith(this.newLine) && currentLine != this.beginLyric) {
						if (lineNumber >= this.numberOfLinesDisplayed) {
							break;
						}
						currentLine += this.newLine;
						++lineNumber;
					}
				}

				// Do not display vocals too early
				if (timeDifference + this.preVocalDisplayTime < 0) {
					if (currentLine == this.beginLyric || currentLine.endsWith(this.newLine)) {
						break;
					}
					stopAtNextLine = true;
				}
				if (!isEndOfCurrent) {
					currentLine += this.endLyric;
					isEndOfCurrent = true;
				}
				currentLine = currentLine + lyric;
				if (isNextNewLine) {
					if (stopAtNextLine) {
						break;
					}
					currentLine += this.newLine;
					++lineNumber;
				} else if (!isNextWithoutSpace) {
					currentLine += ' ';
				}
				// Limit the number of line displayed
				if (lineNumber >= this.numberOfLinesDisplayed) {
					stopAtNextLine = true;
				}
			}
		}
		$(".vocal").html(currentLine);
	},
	onSongChanged(f) {
		$(".vocal").html("");
	},
	onSongStarted(f) {
		$(".vocal").html("");
	},
	onSongEnded(f) {
		$(".vocal").html("");
	}
});