class PlaythroughTracker {
	constructor(poller) {
		this.storage = new SnifferStorage("playthrough_tracker");
		this.poller = poller;

		this.previousBest = null;
		this.currentAttempt = null;

		poller.onData((data) => this.onData(data));
		poller.onSongStarted((song) => this.onSongStarted(song));
		poller.onSongEnded((song) => this.onSongEnded(song));
	}

	hasPreviousBest() {
		return this.previousBest != null;
	}

	isBetter() {
		if(!this.hasPreviousBest()) {
			return true;
		}

		return this.getFinal().RelativeAccuracy >= 0;
	}

	isBetterRelative(time) {
		if(!this.hasPreviousBest()) {
			return true;
		}

		return this.currentAttempt.compareTo(this.previousBest, time, this.poller);
	}

	getFinal() {
		return this.currentAttempt.getFinal(this.previousBest)
	}

	getRelative(time) {
		if(!this.hasPreviousBest()) {
			return null;
		}

		return this.currentAttempt.getRelative(this.previousBest, time, this.poller);
	}

	onData(data) {
		var state = data.currentState;

		if(state == STATE_SONG_STARTING || state == STATE_SONG_PLAYING || state == STATE_SONG_ENDING) {
			if(this.currentAttempt != null) {
				this.currentAttempt.update(data, this.poller);
			}
		}
	}

	onSongStarted(song) {
		this.previousBest = null;

		var arrangement = this.poller.getCurrentArrangement();
		this.currentAttempt = new PlaythroughBySection(arrangement.sections);

		var arr_id = arrangement.arrangementID;

		this.storage.getValue(song.songID+"_"+arr_id).done((data) => {
			var parsed = JSON.parse(data);

			if(parsed != null) {
				this.previousBest = parsed;
				console.log("Loaded previous best");
				console.log(this.previousBest);
			}
		});
	}

	onSongEnded(song) {
		var arrangement = this.poller.getCurrentArrangement();
		var arr_id = arrangement.arrangementID;

		var finalReadout = this.poller.getCurrentReadout();

		this.currentAttempt.finalize(finalReadout);

		if(this.previousBest == null) {
			console.log("Storing first attempt");
			console.log(this.currentAttempt);
			this.storage.setValue(song.songID+"_"+arr_id, this.currentAttempt);
		} else if(this.isBetter()) {
			console.log("Storing better attempt");
			console.log(this.currentAttempt);
			this.storage.setValue(song.songID+"_"+arr_id, this.currentAttempt);
		} else {
			console.log("Not storing worse attempt");
		}
	}
}

class PlaythroughBySection {
	constructor(sections) {
		this.sections = [];

		for (var i = sections.length - 1; i >= 0; i--) {
			this.sections[i] = {}
		}

		this.currentSection = 0;
	}

	getFinal(other) {
		var finalAccuracy = this.sections[this.sections.length-1].Accuracy;

		if(other == null) {
			return {
				CurrentAccuracy: finalAccuracy,
				PreviousAccuracy: 0
			}
		}

		var otherAccuracy = other.sections[other.sections.length-1].Accuracy;

		return {
			CurrentAccuracy: finalAccuracy,
			PreviousAccuracy: otherAccuracy,
			RelativeAccuracy: finalAccuracy - otherAccuracy
		}
	}

	compareTo(other, time, poller) {
		var sectionRelative = this.getRelative(other, time, poller);

		return sectionRelative.Accuracy >= 0;
	}

	getRelative(other, time, poller) {
		var index = poller.getSectionAt(time).index;

		var csection = this._calculateSectionStats(index, this.sections);
		var osection = this._calculateSectionStats(index, other.sections);

		return {
			Accuracy: csection.Accuracy - osection.Accuracy,
			TotalNotesHit: csection.TotalNotesHit - osection.TotalNotesHit,
			TotalNotesMissed: csection.TotalNotesMissed - osection.TotalNotesMissed
		}
	}

	_calculateSectionStats(index, sections) {
		var section = sections[index];

		var prevHitNotes = 0;
		var prevMissedNotes = 0;
		var prevTotalNotes = 0;

		if(index > 0) {
			prevHitNotes = sections[index-1].TotalNotesHit;
			prevMissedNotes = sections[index-1].TotalNotesMissed;
			prevTotalNotes = prevHitNotes + prevMissedNotes;
		}

		var sectionHitNotes = section.TotalNotesHit - prevHitNotes;
		var sectionMissedNotes = section.TotalNotesMissed - prevMissedNotes;
		var sectionTotalNotes = sectionHitNotes + sectionMissedNotes;

		var sectionAccuracy = 1;

		if(sectionTotalNotes > 0) {
			if(sectionHitNotes > 0) {
				sectionAccuracy = sectionHitNotes / sectionTotalNotes;
			}
			else {
				sectionAccuracy = 0;
			}
		}

		return {
			Accuracy: sectionAccuracy * 100,
			TotalNotesHit: sectionHitNotes,
			TotalNotesMissed: sectionMissedNotes
		}
	}

	update(data, poller) {
		var cs = poller.getCurrentSection();
		if(cs == null) {return;}

		var csid = cs.index;

		if(csid > this.currentSection) {
			this.onSectionFinished(this.currentSection, data.memoryReadout.noteData);
			console.log("finished section",this.currentSection, "started section", csid);
			this.currentSection = csid;
		}
	}

	finalize(readout) {
		this.onSectionFinished(this.currentSection, readout.noteData);

		delete this.currentSection;
	}

	onSectionFinished(sectionId, noteData) {
		this.sections[sectionId] = {
			Accuracy: noteData.Accuracy,
			TotalNotesHit: noteData.TotalNotesHit,
			TotalNotesMissed: noteData.TotalNotesMissed
		}
	}
}