class SnifferStorage {
	constructor(addonID, options = {}) {
		this.addonID = addonID;

		if(!this.addonID) {
			throw "Must define addon id";
		}

		var defaultOptions = {
			ip: "127.0.0.1",
			port: "9938"
		}

		//Set up options
		this.options = {}
		$.extend(this.options, defaultOptions, options);
	}

	getValue(key) {
		return $.ajax({
			method: "GET",
			dataType: "text",
			url: "http://"+this.options.ip+":"+this.options.port+"/storage/"+this.addonID+"/"+key,
			crossDomain: true
		});
	}

	setValue(key, value) {
		if(typeof(value) === "object") {
			value = JSON.stringify(value);
		}
		
		return $.ajax({
			method: "PUT",
			crossDomain: true,
			url: "http://"+this.options.ip+":"+this.options.port+"/storage/"+this.addonID+"/"+key,
			data: value
		});
	}
}