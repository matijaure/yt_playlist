yp.scripts.namedstore = function() {

const sep = '|';

const namedstore = {
  name: location,
};

const keyprefix = function() {
  return namedstore.name + sep;
};

const fullkey = function(key) {
  return keyprefix() + key;
};

namedstore.setName = function(name) {
  this.name = name;
};

namedstore.keys = function*() {
  const prefix = keyprefix();
  for(let key in localStorage) {
    if(key.startsWith(prefix)) {
      yield key.slice(prefix.length);
    }
  }
};

namedstore.getItem = function(key) {
  return localStorage.getItem(fullkey(key));
};

namedstore.setItem = function(key, value) {
  return localStorage.setItem(fullkey(key), value);
};

namedstore.removeItem = function(key) {
  return localStorage.removeItem(fullkey(key));
};

namedstore.clear = function() {
  const to_remove = [];
  for(let key of this.keys()) {
    to_remove.push(key);
  }
  for(let key of to_remove) {
    this.removeItem(key);
  }
};

window.namedstore = namedstore;
};
