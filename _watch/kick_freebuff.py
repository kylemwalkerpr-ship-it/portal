#!/usr/bin/env python3
import os, pty, select, time, sys, errno

os.chdir("/Users/phantomdarne/Documents/GitHub/yousafe-portal")
for k, v in {
    "HTTP_PROXY": "http://127.0.0.1:8118",
    "HTTPS_PROXY": "http://127.0.0.1:8118",
    "http_proxy": "http://127.0.0.1:8118",
    "https_proxy": "http://127.0.0.1:8118",
    "NO_PROXY": "127.0.0.1,localhost",
    "no_proxy": "127.0.0.1,localhost",
    "TERM": "xterm-256color",
    "COLUMNS": "120",
    "LINES": "40",
}.items():
    os.environ[k] = v

fifo = "/tmp/freebuff-in"
try:
    os.mkfifo(fifo)
except FileExistsError:
    pass

log = open("/tmp/freebuff-ci-green.log", "ab", buffering=0)
log.write(b"\n--- LAUNCH ---\n")

pid, fd = pty.fork()
if pid == 0:
    os.execv(
        "/Users/phantomdarne/.nvm/versions/node/v22.22.2/bin/freebuff",
        ["freebuff"],
    )

fifo_fd = os.open(fifo, os.O_RDONLY | os.O_NONBLOCK)
buf = b""
chose_model = False
sent_job = False
picker_at = None
input_at = None
start = time.time()
JOB = b"Execute _watch/INSTRUCTOR.md turn ci-green-1 now. Do the whole job, then stop.\r"

while True:
    r, _, _ = select.select([fd, fifo_fd], [], [], 0.4)
    if fifo_fd in r:
        try:
            extra = os.read(fifo_fd, 4096)
        except OSError as e:
            extra = b"" if e.errno in (errno.EAGAIN, errno.EWOULDBLOCK) else (_ for _ in ()).throw(e)
        if extra:
            os.write(fd, extra)
            log.write(b"\n--- FIFO KEYS ---\n" + extra + b"\n")
    if fd in r:
        try:
            data = os.read(fd, 8192)
        except OSError:
            break
        if not data:
            break
        buf += data
        # keep buf from growing without bound
        if len(buf) > 200000:
            buf = buf[-80000:]
        log.write(data)
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
        if (not chose_model) and (b"GPT-5.6 Luna" in buf or b"See all" in buf):
            if picker_at is None:
                picker_at = time.time()
                log.write(b"\n--- PICKER SEEN ---\n")
        if (not sent_job) and (b"Enter a coding task" in buf):
            if input_at is None:
                input_at = time.time()
                log.write(b"\n--- INPUT BOX SEEN ---\n")
    now = time.time()
    if (not chose_model) and picker_at and now - picker_at > 1.5:
        os.write(fd, b"\r")
        chose_model = True
        log.write(b"\n--- ENTER ON LUNA ---\n")
    if (not sent_job) and input_at and now - input_at > 2.0:
        os.write(fd, JOB)
        sent_job = True
        log.write(b"\n--- JOB SENT ---\n")
