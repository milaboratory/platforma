tar czf funny_cats_site.tar.gz --directory=funny_cats_site .

# includes all the content of the dir without the dir itself.
(cd ./funny_cats_site; zip -r ../funny_cats_site.zip .)

