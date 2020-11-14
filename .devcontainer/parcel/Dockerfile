FROM node:12

RUN mkdir -p /usr/app

COPY *.sh /usr/app/

RUN chmod +x /usr/app/*.sh

CMD /bin/bash -c "/usr/app/run.sh"