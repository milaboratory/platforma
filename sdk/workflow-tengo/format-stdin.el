;; This program formats all the data it gets to STDIN as .tengo code. 
;;   usage: cat <file> | emacs --quick --script ./format-stdin.el

;; spaces -> tabs only at the beginning of lines
(setq tabify-regexp "^\t* [ \t]+")

(defun format-tengo-code ()
  (delete-trailing-whitespace)            ;; deletes whitespaces
  (go-mode)                               ;; sets golang rules for indentation
  (tabify (point-min) (point-max))        ;; spaces -> tabs in the whole file
  (indent-region (point-min) (point-max)) ;; indentation in the whole file
)

(defun format-stdin-to-stdout ()
  "Formats stdin data and prints it to stdout"
  (let ((inhibit-message t)
        (message-log-max nil)) ;; Inhibit messages
    (with-temp-buffer
      (insert (with-temp-buffer
                (insert-file-contents "/dev/stdin")
                (buffer-string)))
      (format-tengo-code)
      (princ (buffer-string)))))

(require 'package)
(add-to-list 'package-archives
              '("melpa-stable" . "https://stable.melpa.org/packages/"))
(package-initialize)  
(require 'go-mode)

;; change syntax of a standard go-mode a bit
(advice-add
 'go--in-composite-literal-p
 :filter-return
 (lambda (&rest r) t))

(format-stdin-to-stdout)
