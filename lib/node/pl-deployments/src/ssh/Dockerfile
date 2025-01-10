FROM node:20

RUN apt-get update && \
    apt-get install -y openssh-server && \
    mkdir /var/run/sshd

# RUN echo 'root:rootpassword' | chpasswd

RUN useradd 'pl-doctor'
RUN echo 'pl-doctor:pl-doctor-password' | chpasswd

RUN sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    sed -i 's/^#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config

RUN apt-get install -y locales && \
    locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8

EXPOSE 22 3001

COPY ./test-assets/pub-key.pub /home/pl-doctor/.ssh/authorized_keys
COPY ./test-assets/simple-server.js /home/pl-doctor/simple-server.js

RUN chmod 755 /home/pl-doctor
RUN chown pl-doctor:pl-doctor /home/pl-doctor

RUN chmod +x /home/pl-doctor/simple-server.js

CMD ["/bin/bash", "-c", "/usr/sbin/sshd -D & node /home/pl-doctor/simple-server.js"]