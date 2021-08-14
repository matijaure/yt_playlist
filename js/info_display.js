yp.scripts.info_display = function() {
let info = {};

const SWITCH_TIME = 5000;

if(!yp.info) {
  info.cur_info = {};
  info.messages = [];
  info.cur_message = 0;
  info.prev_switch = 0;
  yp.info = info;
}
else {
  info = yp.info;
}

info.set_info = function(new_info) {
  info.cur_info = new_info;

  const name = new_info.name;
  const desc = new_info.desc;
  const artist = new_info.artist;

  let desc_string = "";
  let title_string = "";
  let artist_string = "";
  if(desc) {
    desc_string = "<span><span>Current Song:</span><span>" + desc + "</span></span>";
    if(name) {
      title_string = "<span><span>Title:</span><span>" + name + "</span></span>";
    }
  }
  else if(name) {
    desc_string = "<span><span>Current Song:</span><span>" + name + "</span></span>";
  }
  else {
    desc_string = "<span><span>Current Song:</span><span>Song Info Missing</span></span>";
  }

  if(artist) {
    artist_string = "<span><span>Artist:</span><span>" + artist + "</span></span>";
  }

  info.cur_message = 0;
  info.prev_switch = performance.now();
  const info_elem = document.getElementById("info");

  let test = desc_string + title_string + artist_string;
  info.messages = [test];
  info_elem.innerHTML = test;
  //test if should wrap
  if(info_elem.scrollWidth > info_elem.offsetWidth) {
    let test = title_string + artist_string;
    info.messages = [desc_string, test];
    info_elem.innerHTML = test;
    if(info_elem.scrollWidth > info_elem.offsetWidth) {  
      info.messages = [desc_string, title_string, artist_string];
    }
    info_elem.innerHTML = desc_string;
  }
};

//this should be called every frame
info.display_info = function() {
  //switch the message every so often
  if(performance.now() - info.prev_switch > SWITCH_TIME) {
    info.prev_switch = performance.now();
    info.cur_message = (info.cur_message + 1) % info.messages.length;
    const info_elem = document.getElementById("info");
    info_elem.innerHTML =info.messages[info.cur_message];
  }
};

info.debug = function(m) {
  const log = document.getElementById('debug-log');
  const new_message = document.createElement('div');
  new_message.innerHTML = m;
  log.appendChild(new_message);
};

};