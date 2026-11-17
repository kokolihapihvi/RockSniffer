class PlaythroughTracker {
	//Create container for tracker data
	constructor(poller) {
		this.storage = new SnifferStorage("playthrough_tracker");
		this.poller = poller;

		this.previousBest = null;
		this.currentAttempt = null;
		this.currentAttemptPhrase = null;

		// Multiplayer runs aren't saved, note data is single-player only
		this.wasMultiplayerMode = false;

		poller.onData((data) => this.onData(data));
		poller.onSongStarted((song) => this.onSongStarted(song));
		poller.onSongEnded((song) => this.onSongEnded(song));
		//In Nonstop Play onSongStarted for the next song can come late, don't keep the old song's attempt
		poller.onSongChanged((song) => this.onSongChanged(song));
	}

	//Check if song has previous best
	hasPreviousBest() {
		return this.previousBest != null;
	}

	//Check if better than previous best
	isBetter() {
		if(!this.hasPreviousBest()) {
			return true;
		}
		if(this.currentAttempt == null) {
			return false;
		}

		// A partial attempt can tie the last section of the stored best, don't let it
		// replace a more complete one
		var countPopulated = function(sections) {
			if(sections == null) return 0;
			var n = 0;
			for(var i = 0; i < sections.length; i++) {
				var s = sections[i];
				if(s != null && s.TotalNotes != null) n++;
			}
			return n;
		};
		if(countPopulated(this.currentAttempt.sections) < countPopulated(this.previousBest.sections)) {
			console.warn("PlaythroughTracker: not storing attempt with fewer sections than the previous best");
			return false;
		}

		return this.getFinal().RelativeAccuracy >= 0;
	}

	//Check if better than previous best
	isBetterRelative(time) {
		if(!this.hasPreviousBest()) {
			return true;
		}
		//No attempt yet between Nonstop songs
		if(this.currentAttempt == null) {
			return true;
		}

		return this.currentAttempt.compareTo(this.previousBest, time, this.poller);
	}
	
	//Get section accuracy
	getSectionAccuracy(time){
		if(this.currentAttempt == null) return 'Rest';
		return this.currentAttempt.getAcc(time, this.poller);
	}
	
	//Get phrase accuracy
	getPhraseAccuracy(time){
		if(this.currentAttemptPhrase == null) return 'Rest';
		return this.currentAttemptPhrase.getAcc(time, this.poller);
	}
	
	//Get phrase grade
	getPhraseGrade(time) {
		if(this.currentAttemptPhrase == null) return 'No Data';
		return this.currentAttemptPhrase.getGrade(time, this.poller);
	}

	//Get stats at end
	getFinal() {
		//No attempt yet between Nonstop songs
		if(this.currentAttempt == null) {
			return { CurrentAccuracy: 0, PreviousAccuracy: 0, RelativeAccuracy: 0 };
		}
		return this.currentAttempt.getFinal(this.previousBest)
	}

	//Get relative performance if has previous best
	getRelative(time) {
		if(!this.hasPreviousBest()) {
			return null;
		}
		if(this.currentAttempt == null) {
			return null;
		}

		return this.currentAttempt.getRelative(this.previousBest, time, this.poller);
	}
	
	//Do onData
	onData(data) {
		var state = data.currentState;

		if(state == STATE_SONG_STARTING || state == STATE_SONG_PLAYING || state == STATE_SONG_ENDING) {
			if(this.currentAttempt != null) {
				this.currentAttempt.update(data, this.poller);
			}
			
			if(this.currentAttemptPhrase != null){				
				this.currentAttemptPhrase.update_phrase(data, this.poller);
			}
		}
	}

	//Do OnSongStarted
	onSongStarted(song) {
		this.previousBest = null;

		var readout = this.poller.getCurrentReadout();
		this.wasMultiplayerMode = (readout && readout.mode === "MULTIPLAYER");

		var arrangement = this.poller.getCurrentArrangement();
		this.currentAttempt = new PlaythroughBySection(arrangement.sections);
		this.currentAttemptPhrase = new PlaythroughByPhrase(arrangement.phraseIterations);

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
	
	//Do on song ended
	onSongEnded(song) {
		if (this.wasMultiplayerMode) {
			console.log("PlaythroughTracker: not storing multiplayer attempt");
			return;
		}

		//Can happen at Nonstop song changes
		if(this.currentAttempt == null) {
			console.warn("PlaythroughTracker.onSongEnded: no currentAttempt, skipping save");
			return;
		}

		var arrangement = this.poller.getCurrentArrangement();
		if(arrangement == null) {
			console.warn("PlaythroughTracker.onSongEnded: no resolvable arrangement, skipping save");
			return;
		}

		var arr_id = arrangement.arrangementID;

		var finalReadout = this.poller.getCurrentReadout();

		// Skip attempts that were never played. Check before finalize(), which fills
		// in the current section and would make an empty attempt look played.
		var totalNotes = (finalReadout && finalReadout.noteData)
			? finalReadout.noteData.TotalNotes
			: 0;
		if(!totalNotes || totalNotes <= 0) {
			console.warn("PlaythroughTracker.onSongEnded: no notes, skipping save");
			return;
		}

		var finishedSections = 0;
		if(this.currentAttempt && this.currentAttempt.sections) {
			for(var i = 0; i < this.currentAttempt.sections.length; i++) {
				var sec = this.currentAttempt.sections[i];
				if(sec != null && sec.TotalNotes != null && sec.TotalNotes > 0) {
					finishedSections++;
				}
			}
		}
		if(finishedSections === 0) {
			console.warn("PlaythroughTracker.onSongEnded: no sections finished, skipping save");
			return;
		}

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

	//Do on song changed, onSongStarted sets up the new attempt
	onSongChanged(song) {
		this.currentAttempt = null;
		this.currentAttemptPhrase = null;
		this.previousBest = null;
	}
}

class PlaythroughBySection {
	
	//Create storage for section variables
	constructor(sections) {
		this.sections = [];

		for (var i = sections.length - 1; i >= 0; i--) {
			this.sections[i] = {}
		}

		this.currentSection = 0;
	}

	//Get final stats
	getFinal(other) {
		//Sections start as {} placeholders until finished
		var lastSection = this.sections[this.sections.length-1];
		var finalAccuracy = (lastSection != null && lastSection.Accuracy != null) ? lastSection.Accuracy : 0;

		if(other == null) {
			return {
				CurrentAccuracy: finalAccuracy,
				PreviousAccuracy: 0
			}
		}

		var otherLast = other.sections[other.sections.length-1];
		var otherAccuracy = (otherLast != null && otherLast.Accuracy != null) ? otherLast.Accuracy : 0;

		return {
			CurrentAccuracy: finalAccuracy,
			PreviousAccuracy: otherAccuracy,
			RelativeAccuracy: finalAccuracy - otherAccuracy
		}
	}

	//Compare to previous best
	compareTo(other, time, poller) {
		if(other == null) return true;
		var sectionRelative = this.getRelative(other, time, poller);
		if(sectionRelative == null) return true;

		return sectionRelative.Accuracy >= 0;
	}
	
	//Get relative improvement/worsening
	getRelative(other, time, poller) {
		if(other == null) return null;
		var sec = poller.getSectionAt(time);
		if(sec == null) return null;
		var index = sec.index;

		var csection = this._calculateSectionStats(index, this.sections);
		var osection = this._calculateSectionStats(index, other.sections);

		return {
			Accuracy: csection.Accuracy - osection.Accuracy,
			TotalNotesHit: csection.TotalNotesHit - osection.TotalNotesHit,
			TotalNotesMissed: csection.TotalNotesMissed - osection.TotalNotesMissed,
			TotalNotes: csection.TotalNotes - osection.TotalNotes
		}
	}
	
	//get section accuracy
	getAcc(time, poller) {
		var sec = poller.getSectionAt(time);
		if(sec == null) return 'Rest';
		var index = sec.index;
		var sectionAcc = this._calculateSectionStats(index, this.sections);
		return sectionAcc.Accuracy;
	}
	
	//calculate section stats
	_calculateSectionStats(index, sections) {
		//In Nonstop Play the index can briefly come from the next song's arrangement
		if(sections == null || index == null || index < 0 || index >= sections.length) {
			return { Accuracy: 'Rest', TotalNotesHit: 0, TotalNotesMissed: 0, TotalNotes: 0 };
		}

		var section = sections[index];
		//Not finished yet
		if(section == null || section.TotalNotes == null) {
			return { Accuracy: 'Rest', TotalNotesHit: 0, TotalNotesMissed: 0, TotalNotes: 0 };
		}

		var prevHitNotes = 0;
		var prevMissedNotes = 0;
		var prevTotalNotes = 0;

		if(index > 0) {
			var prevSection = sections[index-1];
			if(prevSection != null && prevSection.TotalNotes != null) {
				prevHitNotes = prevSection.TotalNotesHit;
				prevMissedNotes = prevSection.TotalNotesMissed;
				prevTotalNotes = prevSection.TotalNotes;
			}
		}
		
		var sectionHitNotes = section.TotalNotesHit - prevHitNotes;
		var sectionMissedNotes = section.TotalNotesMissed - prevMissedNotes;
		var sectionTotalNotes = section.TotalNotes - prevTotalNotes;	
		
		var sectionAccuracy = 'Rest';
		if(sectionTotalNotes > 0) {
			if(sectionHitNotes > 0) {
				sectionAccuracy = sectionHitNotes / sectionTotalNotes * 100;
			}
			else {
				sectionAccuracy = 0;
			}
		}

		return {
			Accuracy: sectionAccuracy,
			TotalNotesHit: sectionHitNotes,
			TotalNotesMissed: sectionMissedNotes,
			TotalNotes: sectionTotalNotes
		}
	}
	
	//Update the info
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

	//finalize info for storage
	finalize(readout) {
		// Mode-1 addons finalize before the tracker does, so this can run twice
		if (this.currentSection === undefined) return;
		this.onSectionFinished(this.currentSection, readout.noteData);

		delete this.currentSection;
	}

	//Pull updated info on section end
	onSectionFinished(sectionId, noteData) {
		this.sections[sectionId] = {
			Accuracy: noteData.Accuracy,
			TotalNotesHit: noteData.TotalNotesHit,
			TotalNotesMissed: noteData.TotalNotesMissed,
			TotalNotes: noteData.TotalNotes,
		}
	}	
	
}


class PlaythroughByPhrase {
	
	//Create structure for storing phrase info
	constructor(phraseIterations) {
		this.phraseIterations = [];

		for (var i = phraseIterations.length - 1; i >= 0; i--) {
			this.phraseIterations[i] = {}
		}

		this.currentPhrase = 0;
	}
	
	//Get phrase grade
	getGrade(time, poller) {
		var ph = poller.getPhraseAt(time);
		if(ph == null) return 'No Data';
		var index = ph.index;
		var phraseGrade = this._calculatePhraseStats(index, this.phraseIterations);
		return phraseGrade.Grade;
	}
	
	//Get phrase accuracy
	getAcc(time, poller) {
		var ph = poller.getPhraseAt(time);
		if(ph == null) return 'Rest';
		var index = ph.index;
		var phraseAcc = this._calculatePhraseStats(index, this.phraseIterations);
		return phraseAcc.Accuracy;
	}
	
	//calculate other phrase stats
	_calculatePhraseStats(index, phraseIterations) {
		//See _calculateSectionStats
		if(phraseIterations == null || index == null || index < 0 || index >= phraseIterations.length) {
			return {
				Accuracy: 'Rest', TotalNotesHit: 0, TotalNotesMissed: 0, TotalNotes: 0,
				PerfectPhrase: 0, GoodPhrase: 0, PassedPhrase: 0, FailedPhrase: 0, Grade: 'No Data'
			};
		}

		var phrase = phraseIterations[index];
		if(phrase == null || phrase.TotalNotes == null) {
			return {
				Accuracy: 'Rest', TotalNotesHit: 0, TotalNotesMissed: 0, TotalNotes: 0,
				PerfectPhrase: 0, GoodPhrase: 0, PassedPhrase: 0, FailedPhrase: 0, Grade: 'No Data'
			};
		}
		
		var prevHitNotes = 0;
		var prevMissedNotes = 0;
		var prevTotalNotes = 0;
		var prevPerfPhra = 0;
		var prevGoodPhra = 0;
		var prevPassPhra = 0;
		var prevFailPhra = 0;

		if(index > 0) {
			var prevPhrase = phraseIterations[index-1];
			if(prevPhrase != null && prevPhrase.TotalNotes != null) {
				prevHitNotes = prevPhrase.TotalNotesHit;
				prevMissedNotes = prevPhrase.TotalNotesMissed;
				prevTotalNotes = prevPhrase.TotalNotes;
				prevPerfPhra = prevPhrase.PerfectPhrases;
				prevGoodPhra = prevPhrase.GoodPhrases;
				prevPassPhra = prevPhrase.PassedPhrases;
				prevFailPhra = prevPhrase.FailedPhrases;
			}
		}
						
		var phraseHitNotes = phrase.TotalNotesHit - prevHitNotes;
		var phraseMissedNotes = phrase.TotalNotesMissed - prevMissedNotes;
		var phraseTotalNotes = phrase.TotalNotes - prevTotalNotes;				
		var phrasePerf = phrase.PerfectPhrases - prevPerfPhra;
		var phraseGood = phrase.GoodPhrases - prevGoodPhra;
		var phrasePass = phrase.PassedPhrases - prevPassPhra;
		var phraseFail = phrase.FailedPhrases - prevFailPhra;
				
		var phraseAccuracy = 'Rest';
		if(phraseTotalNotes > 0) {
			if(phraseHitNotes > 0) {
				phraseAccuracy = phraseHitNotes / phraseTotalNotes * 100;
			}
			else {
				phraseAccuracy = 0;
			}
		}
		
		var phraseGrade = 'No Data'
		if(phrasePerf > 0){
			var phraseGrade = 'Perfect';
		} else if (phraseGood > 0){
			var phraseGrade = 'Good';
		} else if (phrasePass > 0){
			var phraseGrade = 'Pass';
		} else if (phraseFail > 0){
			var phraseGrade = 'Fail'
		} else if(phraseTotalNotes == 0){
			var phraseGrade = 'Rest';
		}
				
		return {
			Accuracy: phraseAccuracy,
			TotalNotesHit: phraseHitNotes,
			TotalNotesMissed: phraseMissedNotes,
			TotalNotes: phraseTotalNotes,
			PerfectPhrase: phrasePerf,
			GoodPhrase: phraseGood,
			PassedPhrase: phrasePass,
			FailedPhrase: phraseFail,
			Grade: phraseGrade
		}
	}

	//update phrase
	update_phrase(data, poller) {
		var cp = poller.getCurrentPhrase();
		if(cp == null) {return;}

		var cpid = cp.index;

		if(cpid > this.currentPhrase) {
			this.onPhraseFinished(this.currentPhrase, data.memoryReadout.noteData);
			console.log("finished phrase",this.currentPhrase, "started phrase", cpid);
			this.currentPhrase = cpid;
		}
	}
	
	//Finalize for readout
	finalize_phrase(readout) {
		this.onPhraseFinished(this.currentPhrase, readout.noteData);

		delete this.currentPhrase;
	}
	
	//get info at end of phrase
	onPhraseFinished(phraseId, noteData) {
		this.phraseIterations[phraseId] = {
			Accuracy: noteData.Accuracy,
			TotalNotesHit: noteData.TotalNotesHit,
			TotalNotesMissed: noteData.TotalNotesMissed,
			TotalNotes: noteData.TotalNotes,
			PerfectPhrases: noteData.PerfectPhrases,
			GoodPhrases: noteData.GoodPhrases,
			PassedPhrases: noteData.PassedPhrases,
			FailedPhrases: noteData.FailedPhrases
		}
	}	
}
