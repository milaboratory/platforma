const iconsFolder = './src/lib/assets/icons/icon-assets';
import fs from 'fs';

let map = {};
function getIconName(fileName) {
  let paths = fileName.split('_');
  return paths.slice(1, paths.length).join('-').split('.')[0];
}
fs.readdir(iconsFolder, (err, files) => {
  files.forEach((file) => {
    const iconName = getIconName(file);
    const size = file.split('_')[0];
    if (!map[size]) {
      map[size] = {};
    }
    map[size][iconName] = file.split('.')[0].replace('-', '\\-');

    console.log(file);
  });
  let sizes = Object.keys(map);
  sizes.forEach((size) => {
    fs.writeFile(`./src/lib/assets/icons/${size}-icons.json`, JSON.stringify(map[size], null, 4), function (err) {
      console.log(err);
    });
  });
});
console.log(map);
