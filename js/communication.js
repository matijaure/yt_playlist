yp.scripts.communication = function() {

if(yp.comm && yp.comm.websocket) {
	yp.comm.websocket.close();
}

const comm = {
	server_hostname: 'localhost',
	server_port: 50000,
};
yp.comm = comm;

comm.websocket = null;
let close_expected = false;

const saved_option_names = ['server_hostname', 'server_port'];

saved_option_names.forEach( function(option_name) {
  const option = namedstore.getItem(option_name);
  if(option) {
    try {
      comm[option_name] = JSON.parse(option);
    }
    catch(err) {
      console.warn("namedstore: " + option_name + " could not be parsed as JSON.");
    }
  }
});

let set_button = function(info, disabled) {
	document.getElementById("comm-button").innerHTML = info;
	document.getElementById("comm-button").disabled = disabled;
};
let set_info = function(info) {
	document.getElementById("comm-info").innerHTML = info;
};
set_info("Not currently connected to bot.");
set_button("Connect", false);


let handle_request = function(request) {
	//console.log(request);
	let response = { type: 'response', rid: request.rid }
	let data = {}
	if(request.data.f === "song") {
		Object.assign(data, yp.player.get_cur_info());
		data.tags = Array.from(data.tags);
		let alternative = yp.player.get_cur_alternative();
		data.url = alternative.id;
	}
	response.data = data;
	comm.websocket.send(JSON.stringify(response));
	//console.log("sent: " + JSON.stringify(response))
};

let handle_send = function(message) {
	//console.log(message);
	if(message.data.f === "close") {
		const reason = message.data.reason;
		const reasons = {
			"SERVER_CLOSE": "Disconnect: The server closed the connection.",
			"SERVER_RESTART": "Disconnect: The server was restarted.",
			"SERVER_SHUTDOWN": "Disconnect: The server was shut down.",
			"TOO_MANY_CONNECTIONS": "Refused: Server is connected to another client.",
		}
		if(reason in reasons) {
			set_info(reasons[reason]);
		}
		else {
			set_info("Server closed for unknown reason: " +  reason);
		}
		close_expected = true;
	}
	if(message.data.f === "say") {
		console.log("They say: " + message.data.message);
	}
};


let onopen = function(event) {
	set_info("Connected!");
	set_button("Disconnect", false);
	comm.push_song();
};
let onerror = function(event) {
	//console.log(event);
	set_info("Could not establish a connection.");
	close_expected = true;
	comm.websocket = null;
};
let onmessage = function (event) {
	let message = JSON.parse(event.data);
	if(message && message.type) {
		switch(message.type) {
			case "get":
				handle_request(message);
				return;
			case "give":
				handle_send(message);
				return;
		}
	}
	console.warn("Websocket got a message it didn't know how to handle:");
	console.warn(message);
};
let onclose = function (event) {
	if(!close_expected) {
		set_info("Server disconnected unexpectedly.");
	}
	set_button("Connect", false);
	close_expected = false;
};

comm.connect = function() {
	const host = document.getElementById("bot-host").value;
	const port = document.getElementById("bot-port").value;
	namedstore.setItem('server_hostname', JSON.stringify(host));
	namedstore.setItem('server_port', JSON.stringify(port));
	comm.server_hostname = host;
	comm.server_port = port;

	comm.websocket = new WebSocket("ws://" + host + ":" + port);
	comm.websocket.onopen = onopen;
	comm.websocket.onerror = onerror;
	comm.websocket.onmessage = onmessage;
	comm.websocket.onclose = onclose;
	set_info("Connecting...");
	set_button("Connecting", true);
};

comm.disconnect = function() {
	if(comm.websocket && comm.websocket.readyState !== WebSocket.OPEN) {
		throw 'Cannot disconnect an unconnected websocket.';
	}
	close_expected = true;
	set_info("Not currently connected to bot.");
	comm.websocket.close();
};

comm.onbutton = function() {
	if(!comm.websocket || comm.websocket.readyState === WebSocket.CLOSED) {
		comm.connect();
	}
	else if(comm.websocket && comm.websocket.readyState === WebSocket.OPEN) {
		comm.disconnect();
	}
};

comm.push_song = function() {
	if(comm.websocket && comm.websocket.readyState === WebSocket.OPEN) {
		let request = { type: 'give' }
		let data = { f: 'song' }
		let song_data = {}

		Object.assign(song_data, yp.player.get_cur_info());
		song_data.tags = Array.from(song_data.tags);
		let alternative = yp.player.get_cur_alternative();
		song_data.url = alternative.id;

		data.song_data = song_data;
		request.data = data;

		comm.websocket.send(JSON.stringify(request));
	}
};


};
