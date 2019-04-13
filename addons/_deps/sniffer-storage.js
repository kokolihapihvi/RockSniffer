class SnifferStorage {
	constructor(addonID, ip, port) {
		this.addonID = addonID;
		this.ip = ip;
		this.port = port;
	}

	getValue(key) {
		return $.ajax({
			method: "GET",
			dataType: "text",
			url: "http://"+ip+":"+port+"/storage/"+this.addonID+"/"+key,
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
			url: "http://"+ip+":"+port+"/storage/"+this.addonID+"/"+key,
			data: value
		});
	}
}