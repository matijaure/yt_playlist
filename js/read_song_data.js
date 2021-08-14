yp.scripts.read_song_data = function(songs) {

//parse this into a more uniform form
let song_data = [];
let tags = new Set();
let uuids = new Set();
let uuid_to_index = {};
let song_weights = [];
let song_index = 0;
songs.forEach( function(song) {
  let data = {};
  data.index = song_index;
  song_index++;
  data.info = {
    desc: song.desc,
    name: song.name,
    artist: song.artist,
    uuid: song.uuid,
    tags: new Set(song.tags),
    weight: song.weight || 1,
    removed: song.removed || false,
    muted: (new Set(song.tags)).has('Muted'),
  };
  //add the tags to the complete set of tags
  data.info.tags.forEach( function(tag) {
    tags.add(tag);
  });
  //add the uuid
  if(data.info.uuid) {
    if(uuids.has(data.info.uuid)) {
      console.warn("This song has a non-unique uuid:");
      console.warn(song);
    }
    uuids.add(data.info.uuid);
    uuid_to_index[data.info.uuid] = data.index;
  }
  else {
    console.warn("This song is missing a uuid:");
    console.warn(song);
  }
  //add the weights
  song_weights.push(data.info.weight);
  //if the tag set is empty, give it a dummy tag so that it will still play in an all include filter
  if(data.info.tags.size == 0) {
    data.info.tags.add("No tags");
    tags.add("No tags");
  }
  let build_alternative = function(obj) {
    return {
      id: obj.id,
      start: obj.start,
      end: obj.end,
      volume: obj.volume,
      expected_fail: obj.expected_fail,
      artist: obj.artist,
      desc: obj.desc,
      name: obj.name,
      weight: obj.weight,
    };
  };
  if(song.alternatives) {
    data.alternatives = song.alternatives.map(build_alternative);
  }
  else {
    data.alternatives = [build_alternative(song)];
  }
  song_data.push(data);
});

yp.song_data = song_data;
yp.tags = tags;
yp.uuids = uuids;
yp.uuid_to_index = uuid_to_index;
yp.song_weights = song_weights;
};
