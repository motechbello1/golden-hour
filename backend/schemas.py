from pydantic import BaseModel
from typing import Optional, List, Literal


class StartExamRequest(BaseModel):
    exam_id: str


class QuestionOut(BaseModel):
    session_id: str
    question_id: str
    index: int
    total: int
    type: Literal["objective", "code"]
    prompt: str
    options: Optional[List[dict]] = None   # shuffled, paraphrased options shown to this student
    time_seconds: int


class AnswerRequest(BaseModel):
    session_id: str
    question_id: str
    selected_option_id: Optional[str] = None
    typed_answer: Optional[str] = None
    time_taken_ms: int
    auto_advanced: bool = False


class ProctorEventRequest(BaseModel):
    session_id: str
    event_type: str
    meta: Optional[dict] = None
    snapshot_base64: Optional[str] = None


class ResultOut(BaseModel):
    session_id: str
    score: float
    max_score: float
    percentage: float
    status: str
    flag_count: int
