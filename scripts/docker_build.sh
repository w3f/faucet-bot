IMAGE=${1}

docker login -u ${DOCKER_USER} -p ${DOCKER_PASSWORD}

docker build -t ${IMAGE}:${CIRCLE_SHA1} -f ${2} .

docker push ${IMAGE}:${CIRCLE_SHA1}

TAG=latest

docker tag ${IMAGE}:${CIRCLE_SHA1} ${IMAGE}:${TAG}

docker push ${IMAGE}:${TAG}
