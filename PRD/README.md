# GPT 이미지 자동 생성기 — 디자인 문서

> Show Me The PRD로 생성됨 (2026-05-04)
> 현재 버전: v2.0.0 배포 준비 중

---

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 3가지 Fix 상세 | 개발 시작 전 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | 3계층 데이터 구조 (localStorage/session/메모리) | 상태 관리 코드 건드릴 때 |
| [03_PHASES.md](./03_PHASES.md) | Phase별 체크리스트 + AI 시작 프롬프트 | 다음 작업 확인할 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | AI 규칙 + 메시지 API + 배포 명령어 | AI에게 코드 시킬 때마다 |
| [05_IMAGE_ATTACH_PRD.md](./05_IMAGE_ATTACH_PRD.md) | 전역 참고 이미지 기능 PRD | 이미지 첨부 기능 참고 시 |
| [07_PATCH_V3.md](./07_PATCH_V3.md) | 이전 패치 계획 | 히스토리 참고 시 |

---

## 현재 상태 (2026-05-04)

```
v1.0.0 (현재 코드) ──── [git tag v1.0.0] ────▶ v2.0.0 (Phase 1 구현 중)
```

**Phase 1 진행 예정:**
- [ ] git tag v1.0.0
- [ ] Fix 1: 이미지 완료 감지 교체
- [ ] Fix 2: 딜레이 UI 제거
- [ ] Fix 3: 체크박스 선택 추가
- [ ] 코드 정리 + manifest v2.0.0

---

## 다음 단계

**Phase 1 시작**: [03_PHASES.md](./03_PHASES.md)의 "Phase 1 시작 프롬프트"를 AI에게 전달

```
이 PRD를 읽고 Phase 1을 구현해주세요.
@PRD/01_PRD.md
@PRD/04_PROJECT_SPEC.md
```

---

## 미결 사항 모음

| 항목 | 출처 |
|------|------|
| `waitForImageAttached()` 8초 타임아웃 v2 유지 여부 | 01_PRD.md |
| 체크박스 상태 localStorage 저장 여부 | 01_PRD.md |
| 카드별 `attachedImages` IndexedDB 영속화 여부 | 02_DATA_MODEL.md |
| `failedIndices` session storage 복원 여부 | 02_DATA_MODEL.md |
| GitHub 저장소 공개/비공개 여부 | 04_PROJECT_SPEC.md |
