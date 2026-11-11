from datetime import datetime, timedelta, timezone

from app.models.user import User, UserStatus


def _member(expires: datetime | None) -> User:
    return User(email="m@example.com", status=UserStatus.ACTIVE, access_expires_at=expires)


def test_no_end_date_stays_active():
    assert _member(None).is_active


def test_future_end_date_stays_active():
    assert _member(datetime.now(timezone.utc) + timedelta(days=1)).is_active


def test_past_end_date_blocks_access():
    member = _member(datetime.now(timezone.utc) - timedelta(minutes=1))
    assert member.access_expired
    assert not member.is_active


def test_naive_date_is_read_as_utc():
    assert not _member(datetime.utcnow() - timedelta(minutes=1)).is_active
