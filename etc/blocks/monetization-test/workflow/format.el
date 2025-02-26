;; This program formats all files inside src directory. Usage: emacs --script ./format.el

(defun install-go-mode ()
  "Installs go-mode"
  (require 'package)
  (add-to-list 'package-archives
               '("melpa-stable" . "https://stable.melpa.org/packages/"))
  (package-initialize)
  (unless package-archive-contents
    (package-refresh-contents))

  (package-install 'go-mode t)
  (require 'go-mode))

;; spaces -> tabs only at the beginning of lines
(setq tabify-regexp "^\t* [ \t]+")

(defun format-file (file)
  "Formats a file according to slightly changed Go rules"
  (message "Format %s" file)
  (save-excursion
    (find-file file)
    (delete-trailing-whitespace)            ;; deletes whitespaces
    (go-mode)                               ;; sets golang rules for indentation
    (tabify (point-min) (point-max))        ;; spaces -> tabs in the whole file
    (indent-region (point-min) (point-max)) ;; indentation in the whole file
    (save-buffer)))                         ;; save file

(install-go-mode)

;; change syntax of a standard go-mode a bit
(advice-add
 'go--in-composite-literal-p
 :filter-return
 (lambda (&rest r) t))

;; find all files in src
(setq files (directory-files-recursively "src" "\\.tengo\\'"))

;; call format on every file.
(dolist (file files)
  (format-file file))

