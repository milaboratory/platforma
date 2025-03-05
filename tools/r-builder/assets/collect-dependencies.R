library(pkgdepends)

repo_root <- "."

cut_prefix <- function(str, prefix) {
  if (startsWith(str, prefix)) {
    return(substr(str, nchar(prefix) + 1, nchar(str)))
  }

  return(str)
}

ensure_parent_dir_exists <- function(target_file) {
  if (file.exists(dirname(target_file))) {
    return()
  }

  dir.create(dirname(target_file), recursive = TRUE)
}

get_path_depth <- function(target_file) {
  path_depth <- 0
  while (TRUE) {
    parent_path <- dirname(target_file)
    if (parent_path == target_file) {
      return(path_depth)
    }
    target_file <- parent_path
    path_depth <- path_depth + 1
  }
}

get_package <- function(url, dest_name, ...) {
  destfile <- file.path(repo_root, dest_name)
  if (!file.exists(destfile)) {
    ensure_parent_dir_exists(destfile)
    download.file(url, destfile, ...)
  }

  return()
}

create_alias <- function(original_name, alias_name) {
  if (file.exists(alias_name)) {
    return()
  }

  ensure_parent_dir_exists(alias_name)
  depth <- get_path_depth(alias_name)
  depth <- depth - 1 # don't count file name it

  relative <- "."
  for (i in seq_len(depth)) {
    relative <- file.path(relative, "..")
  }

  file.symlink(file.path(relative, original_name), alias_name)
}

pkgs <- commandArgs(trailingOnly = TRUE) # "openssl@2.2.2", "openssl@2.3.0"
print("Loading packages and their dependencies:")
print(pkgs)

pdl <- new_pkg_download_proposal(pkgs)
pdl$resolve()
deps <- pdl$get_resolution()

for (i in seq_len(nrow(deps))) {
  urls <- deps$sources[i][[1]]
  dest <- deps$target[i]
  get_package(urls[1], dest)

  if (length(urls) > 1) {
    base_url <- deps$mirror[i]

    for (i in 2:length(urls)) {
      additional_url <- urls[i]
      alias <- cut_prefix(additional_url, paste0(base_url, "/"))
      create_alias(dest, alias)
    }
  }
}

repos <- unique(deps$repodir)
for (repo_name in repos) {
  if (startsWith(repo_name, "bin/")) {
    tools::write_PACKAGES(
      file.path(repo_root, repo_name),
      type = "mac.binary",
    )
  } else {
    tools::write_PACKAGES(file.path(repo_root, repo_name))
  }
}

warnings()
