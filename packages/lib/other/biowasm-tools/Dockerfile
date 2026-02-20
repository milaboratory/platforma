FROM fedora:rawhide AS build

WORKDIR /build

ADD https://github.com/emscripten-core/emsdk.git#404dc1ec13f64fce1af1eaf5c007e18212f63527 emsdk
ADD https://github.com/TimoLassmann/kalign.git#05faef5657d4099d763fbe973a9e7546b777f7e9 kalign
ADD https://github.com/somme89/rapidNJ.git#ed2d36e219d9db16778b941b5054c0fd021b528a rapidNJ

RUN dnf upgrade -y && dnf install -y clang cmake ninja patch python

WORKDIR /build/emsdk
RUN ./emsdk install latest && ./emsdk activate latest

ARG EMCC_CFLAGS="\
-mrelaxed-simd \
-O3 \
-flto \
-g2 \
-sALLOW_MEMORY_GROWTH \
-sENVIRONMENT=web,worker \
-sEXPORT_ES6 \
-sNO_POLYFILL \
-sNO_INVOKE_RUN \
-sSINGLE_FILE \
-sEXPORTED_RUNTIME_METHODS=FS_readFile,FS_writeFile,callMain"

WORKDIR /build/kalign
COPY patches/kalign.patch .
RUN patch -p0 < kalign.patch

WORKDIR /build/kalign/build
RUN source /build/emsdk/emsdk_env.sh && \
emcmake cmake -G Ninja .. -DUSE_OPENMP=0 && \
cmake --build . -t kalign-bin

WORKDIR /build/rapidNJ
COPY patches/rapidNJ.patch .
# # RUN sed -i '/#include <mm_malloc.h>/d' lib/src/*.c
RUN patch -p0 < rapidNJ.patch
RUN source /build/emsdk/emsdk_env.sh && \
emmake make -j

FROM scratch
COPY --from=build \
/build/kalign/build/src/kalign.js \
/build/rapidNJ/bin/rapidnj.js \
/
