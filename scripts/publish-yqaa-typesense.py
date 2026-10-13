"""Idempotently publish a verified immutable public-knowledge snapshot."""
import hashlib,json,os,pathlib
import modal

def validate_existing(existing, local, digest):
    if existing.get('sha256') != local['sha256'] or existing.get('count') != local['count'] or digest != local['sha256']:
        raise RuntimeError('existing_snapshot_invalid')

def main():
    root=pathlib.Path(os.environ.get('YQAA_SNAPSHOT_DIR','/tmp/yqaa-typesense-snapshot'))
    manifest=json.loads((root/'manifest.json').read_text())
    version=manifest['sha256']
    if len(version)!=64 or any(c not in '0123456789abcdef' for c in version):
        raise RuntimeError('invalid_snapshot_version')
    if hashlib.sha256((root/'chunks.jsonl').read_bytes()).hexdigest()!=version:
        raise RuntimeError('local_snapshot_invalid')
    volume=modal.Volume.from_name('yqaa-typesense-public-snapshots')
    try:
        existing=json.loads(b''.join(volume.read_file('/'+version+'/manifest.json')))
    except FileNotFoundError:
        with volume.batch_upload() as upload:
            upload.put_directory(root, '/'+version)
    else:
        digest=hashlib.sha256()
        for chunk in volume.read_file('/'+version+'/chunks.jsonl'):digest.update(chunk)
        validate_existing(existing,manifest,digest.hexdigest())
    print(version)

if __name__=='__main__':main()
