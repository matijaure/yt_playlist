yp.scripts.player = function() {
let player = {};
//https://stackoverflow.com/questions/7853904/how-to-detect-when-a-youtube-video-finishes-playing
//https://stackoverflow.com/questions/42271570/youtube-api-loop-video-between-set-start-and-end-times
//helped too
if(!yp.player) {
  //player.shuffle = false;
  player.song_order = "shuffle";
  player.skip_expected_fail = false;
  //player.player_hidden = false;
  player.advanced_view = false;

  player.cur_song = 0;
  player.cur_alternative = 0;
  player.fail_timeout = 0;

  player.volume_perc = 100;

  player.p = null;
  player.ready = false;
  yp.player = player;
}
else {
  player = yp.player;
}

// const saved_option_names = ['shuffle', 'skip_expected_fail', 'player_hidden', 'volume_perc'];
const saved_option_names = ['song_order', 'skip_expected_fail', 'volume_perc', 'advanced_view'];

saved_option_names.forEach( function(option_name) {
  const option = namedstore.getItem(option_name);
  if(option) {
    try {
      player[option_name] = JSON.parse(option);
    }
    catch(err) {
      console.warn("namedstore: " + option_name + " could not be parsed as JSON.");
      namedstore.setItem(option_name, JSON.stringify(player[option_name]));
    }
  }
  else {
    namedstore.setItem(option_name, JSON.stringify(player[option_name]));
  }
});


let get_cur_alternative = function() {
  let default_alt = {
    id: '' //this will cause a load fail
  };
  //we don't assume this has been loaded
  const song_data = yp.song_data;
  if(song_data && song_data[player.cur_song] && song_data[player.cur_song].alternatives[player.cur_alternative]) {
    return song_data[player.cur_song].alternatives[player.cur_alternative];
  }
  return default_alt;
};
player.get_cur_alternative = get_cur_alternative;

let get_cur_info = function() {
  let default_info = {
    desc: "Song Data Missing"
  };
  //we don't assume this has been loaded
  const song_data = yp.song_data;
  const cur_song_data = song_data[player.cur_song];
  if(song_data && cur_song_data) {
    const info = {};
    Object.assign(info, cur_song_data.info);
    const cur_alternative = get_cur_alternative();
    let overwrite_info = function(field_name) {
      info[field_name] = cur_alternative[field_name] || info[field_name];
    }
    overwrite_info('artist');
    overwrite_info('desc');
    overwrite_info('name');
    return info;
  }
  return default_info;
};
player.get_cur_info = get_cur_info;


let _play = function() {
  const song = get_cur_alternative();
  player.p.loadVideoById({
    videoId: song.id,
    startSeconds: song.start,
    endSeconds: song.end,
  });
  player.set_volume();
  player.fail_timeout = performance.now();
  yp.song_order.add_to_song_queue(player.cur_song);
  if(yp.comm) {
    yp.comm.push_song();
  }

  //update the like/disable checkboxes
  document.getElementById("cb-like").checked = yp.tag_data.liked.has(get_cur_info().uuid);
  document.getElementById("cb-disable").checked = yp.tag_data.disabled.has(get_cur_info().uuid);

  document.getElementById("cb-repeat").checked = false;

  if(yp.info) {
    yp.info.set_info( get_cur_info() );
    yp.info.display_info();
  }
}

player.set_volume = function() {
  const song = get_cur_alternative();
  player.p.setVolume( Math.max( (song.volume || 100) * (player.volume_perc / 100),  1) );
};

player.play_next = function() {
  //we don't assume this has been loaded
  const song_data = yp.song_data;
  const song_order = yp.song_order;
  if(!song_data || !song_order) {
    document.getElementById("info").innerHTML = "Song Data Is Not Loaded";
    return;
  }

  let timeout = 0;
  while(timeout++ < 10000) {
    player.cur_alternative = 0;
    player.alternatives_tried = 1;
    player.cur_song = song_order.get_next_song();
    if(yp.tag_data && !yp.tag_data.should_play(song_data[player.cur_song]) ) {
      continue;
    }
    const alternatives = song_data[player.cur_song].alternatives;
    const info = song_data[player.cur_song].info;
    if(alternatives.length > 1) {
      const weights = alternatives.map( (alternative) => (alternative.weight || 1) );
      player.cur_alternative = song_order.weighted_select(alternatives, weights).index;
    }
    const song = alternatives[player.cur_alternative];
    if((player.skip_expected_fail && song.expected_fail) || info.removed) {
      player.try_alternative();
      return;
    }
    break;
  }
  _play();
};

player.try_alternative = function() {
  //we don't assume this has been loaded
  const song_data = yp.song_data;
  if(!song_data || !song_data[player.cur_song]) {
    document.getElementById("info").innerHTML = "Song Data Is Not Loaded";
    return;
  }

  const num_alternatives = song_data[player.cur_song].alternatives.length;
  while(player.alternatives_tried <= num_alternatives) {
    player.cur_alternative = (player.cur_alternative + 1) % num_alternatives;
    player.alternatives_tried++;
  }
  if(player.alternatives_tried > num_alternatives) {
    player.play_next();
  }
  else {
    _play();
  }
};

window.onYouTubePlayerAPIReady = function() {
  player.p = new YT.Player('player', {
    width: '640',
    height: '360',
    videoId: null,
    playerVars: {
      //controls: 0, // Don't show pause/play buttons in player
      fs: 0, //disable fullscreen
      rel: 0, //don't show related videos. Apparently this is getting depricated though
      modestbranding: 1, // Hide the Youtube Logo
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

// autoplay first video
window.onPlayerReady = function(event) {
    player.play_next();
    player.ready = true;
};

player.on_song_end = function() {
  let repeat_cb = document.getElementById("cb-repeat");
  if(repeat_cb.checked) {
    player.p.seekTo(get_cur_alternative().start);
    repeat_cb.checked = false;
  }
  else {
    player.play_next();
  }
};

let prev_end = 0;
// when video ends
window.onPlayerStateChange = function(event) {
  let t = performance.now();
  document.getElementById("play-pause").innerHTML = "-";
  if(event.data === YT.PlayerState.ENDED) {
    //hilariously horrible hack to get around 'endSeconds' video ends causing the next vid to end instantly since it changes to ENDED twice
    if(t - prev_end > 6000) {
      prev_end = t;
      player.on_song_end();
    }
  }
  else if(event.data === YT.PlayerState.PLAYING) {
    document.getElementById("play-pause").innerHTML = "Pause";
  }
  else if(event.data === YT.PlayerState.PAUSED) {
    document.getElementById("play-pause").innerHTML = "Play";
  }

};

};
