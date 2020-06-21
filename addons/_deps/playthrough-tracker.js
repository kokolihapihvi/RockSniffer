class PlaythroughTracker {
	//Create container for tracker data
	constructor(poller) {
		this.storage = new SnifferStorage("playthrough_tracker");
		this.poller = poller;

		this.previousBest = null;
		this.currentAttempt = null;
		this.currentAttemptPhrase = null;

		poller.onData((data) => this.onData(data));
		poller.onSongStarted((song) => this.onSongStarted(song));
		poller.onSongEnded((song) => this.onSongEnded(song));
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

		return this.getFinal().RelativeAccuracy >= 0;
	}

	//Check if better than previous best
	isBetterRelative(time) {
		if(!this.hasPreviousBest()) {
			return true;
		}

		return this.currentAttempt.compareTo(this.previousBest, time, this.poller);
	}
	
	//Get section accuracy
	getSectionAccuracy(time){
		return this.currentAttempt.getAcc(time, this.poller);
	}
	
	//Get phrase accuracy
	getPhraseAccuracy(time){
		return this.currentAttemptPhrase.getAcc(time, this.poller);
	}
	
	//Get phrase grade
	getPhraseGrade(time) {
		return this.currentAttemptPhrase.getGrade(time, this.poller);
	}

	//Get stats at end
	getFinal() {
		return this.currentAttempt.getFinal(this.previousBest)
	}

	//Get relative performance if has previous best
	getRelative(time) {
		if(!this.hasPreviousBest()) {
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

	//Compare to previous best
	compareTo(other, time, poller) {
		var sectionRelative = this.getRelative(other, time, poller);

		return sectionRelative.Accuracy >= 0;
	}
	
	//Get relative improvement/worsening
	getRelative(other, time, poller) {
		var index = poller.getSectionAt(time).index;

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
		var index = poller.getSectionAt(time).index;
		var sectionAcc = this._calculateSectionStats(index, this.sections);
		return sectionAcc.Accuracy;
	}
	
	//calculate section stats
	_calculateSectionStats(index, sections) {
		var section = sections[index];

		var prevHitNotes = 0;
		var prevMissedNotes = 0;
		var prevTotalNotes = 0;

		if(index > 0) {
			prevHitNotes = sections[index-1].TotalNotesHit;
			prevMissedNotes = sections[index-1].TotalNotesMissed;
			prevTotalNotes = sections[index-1].TotalNotes;

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
		var index = poller.getPhraseAt(time).index;
		var phraseGrade = this._calculatePhraseStats(index, this.phraseIterations);
		return phraseGrade.Grade;
	}
	
	//Get phrase accuracy
	getAcc(time, poller) {
		var index = poller.getPhraseAt(time).index;
		var phraseAcc = this._calculatePhraseStats(index, this.phraseIterations);
		return phraseAcc.Accuracy;
	}
	
	//calculate other phrase stats
	_calculatePhraseStats(index, phraseIterations) {
		var phrase = phraseIterations[index];
		
		var prevHitNotes = 0;
		var prevMissedNotes = 0;
		var prevTotalNotes = 0;
		var prevPerfPhra = 0;
		var prevGoodPhra = 0;
		var prevPassPhra = 0;
		var prevFailPhra = 0;

		if(index > 0) {	
			prevHitNotes = phraseIterations[index-1].TotalNotesHit;
			prevMissedNotes = phraseIterations[index-1].TotalNotesMissed;
			prevTotalNotes = phraseIterations[index-1].TotalNotes;
			prevPerfPhra = phraseIterations[index-1].PerfectPhrases;
			prevGoodPhra = phraseIterations[index-1].GoodPhrases;
			prevPassPhra = phraseIterations[index-1].PassedPhrases;
			prevFailPhra = phraseIterations[index-1].FailedPhrases;
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
