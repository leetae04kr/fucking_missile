# 이란 탄도미사일 3D 궤적 및 탄착점 EDA

RocketPy 기반의 3차원 Monte Carlo 비행 시뮬레이션으로 합성 궤적 데이터를 생성하고, 물리 변수와 환경 불확실성이 비행 궤적 및 탄착 오차에 미치는 영향을 분석하는 프로젝트입니다.

## 1. 연구 목적

발사 초기 레이더 텔레메트리만으로 최종 탄착점을 추정하는 문제를 연구하기 위해, 위치·속도·가속도뿐 아니라 대기 상태와 공력 변수를 포함한 시계열 데이터셋을 구축합니다.

이 프로젝트는 머신러닝 학습 데이터 생성에만 머무르지 않고 다음의 EDA 질문에 답하는 것을 목표로 합니다.

- 바람, 공기저항계수, 초기 질량 중 어떤 Monte Carlo 요인이 탄착 오차에 가장 큰 영향을 주는가?
- 네 기종의 마하수, 동압, 고도별 속도 프로파일은 어떻게 다른가?
- 사용자 정의 대기 모델에 따른 밀도 감소가 항력과 가속도 변화에 어떻게 나타나는가?
- 동일 기종 내 환경 불확실성이 만드는 탄착점 산포와 CEP는 어느 정도인가?

## 2. 연구 대상

| 미사일 | 분류 | 추진체 | 참고 전장 (m) | 참고 직경 (m) | 참고 발사 중량 (kg) | 참고 사거리 (km) |
|---|---|---|---:|---:|---:|---:|
| Khalij Fars | 단거리 대함 ASBM | 고체 | 8.9 | 0.61 | 약 3,320 | 300 |
| Qiam-1 | 단거리 지대지 SRBM | 액체 | 11.5 | 0.88 | 6,155 | 700~800 |
| Zolfaghar | 중거리 지대지 MRBM | 고체 | 10.3 | 0.68 | 4,620 | 700 |
| Shahab-3 | 중거리 지대지 MRBM | 액체 | 16.0 | 1.25 | 15,000~16,000 | 1,000~2,000 |

위 표는 연구 대상에 대한 참고 제원입니다. 실제 실행값은 노트북의 `MISSILE_SPECS`와 `create_missile` 함수에 정의된 단순화 모델을 따릅니다.

## 3. 시뮬레이션 방법

### 비행 모델

- RocketPy 기반 6자유도 비행역학 시뮬레이션
- 기종별 반지름, 추진제 질량, 본체 질량, 연소 시간, 추력 반영
- 발사 고각 60~80도, 방위각 0~360도
- 발사 후 1초 간격과 최종 비행 시점의 상태 저장

### 사용자 정의 대기 모델

노트북은 다음 함수를 사용합니다.

```python
custom_pressure(z) = 101325 * exp(-z / 8420)
custom_temperature(z) = 288.15 - 0.0065 * z  # z < 11,000 m
custom_temperature(z) = 216.65              # z >= 11,000 m
```

밀도는 이상기체 관계식으로 계산합니다.

$$
\rho = \frac{p}{R T}, \qquad R = 287.05\ \mathrm{J/(kg\cdot K)}
$$

동압과 항력은 다음 관계를 사용합니다.

$$
q = \frac{1}{2}\rho v^2, \qquad D = q C_d A
$$

### Monte Carlo 변동

| 변수 | 분포 또는 범위 | 의미 |
|---|---|---|
| `wind_u`, `wind_v` | 평균 0, 표준편차 10 m/s 정규분포 | 동서·남북 바람 성분 |
| `cd_factor` | 0.90~1.10 균등분포 | 기준 공기저항계수 변동 배율 |
| `initial_mass_factor` | 0.95~1.05 균등분포 | 초기 질량 변동 배율 |
| `launch_elevation` | 60~80도 균등분포 | 발사 고각 |
| `launch_azimuth` | 0~360도 균등분포 | 발사 방위각 |

## 4. 데이터 파일

각 기종에 대해 두 종류의 CSV가 생성됩니다.

```text
{missile}_10K_RealScale.csv
{missile}_10K_RealScale_Summary.csv
```

예시:

- `Khalij_Fars_10K_RealScale.csv`
- `Khalij_Fars_10K_RealScale_Summary.csv`
- `Qiam_1_10K_RealScale.csv`
- `Qiam_1_10K_RealScale_Summary.csv`
- `Zolfaghar_10K_RealScale.csv`
- `Zolfaghar_10K_RealScale_Summary.csv`
- `Shahab_3_10K_RealScale.csv`
- `Shahab_3_10K_RealScale_Summary.csv`

현재 노트북은 `NUM_SIMULATIONS_PER_MISSILE = 10`으로 설정된 테스트용 상태입니다. 연구 목표 규모는 기종별 10,000회, 총 40,000회 궤적 시퀀스입니다.

## 5. 시계열 데이터 컬럼

| 컬럼 | 의미 | 단위 |
|---|---|---|
| `sim_id` | 비행 회차 식별자 | 정수 |
| `missile_type` | 미사일 기종 | 문자열 |
| `time_step` | 발사 후 경과 시간 | s |
| `wind_u`, `wind_v` | 입력된 바람 성분 | m/s |
| `wind_u_scale`, `wind_v_scale` | Monte Carlo 바람 원본 값 | m/s |
| `cd_factor` | 공기저항계수 변동 배율 | 무차원 |
| `initial_mass_factor` | 초기 질량 변동 배율 | 무차원 |
| `launch_elevation`, `launch_azimuth` | 발사 방향 | degree |
| `weather_wind_speed` | 바람 벡터 크기 | m/s |
| `weather_wind_direction_deg` | 바람 방향 | degree |
| `weather_pressure` | 현재 고도 대기압 | Pa |
| `weather_temperature` | 현재 고도 대기 온도 | K |
| `weather_air_density`, `air_density` | 현재 고도 공기 밀도 | kg/m³ |
| `x`, `y`, `z` | 위치 | m |
| `vx`, `vy`, `vz` | 속도 성분 | m/s |
| `ax`, `ay`, `az` | 가속도 성분 | m/s² |
| `pitch`, `yaw` | 자세 방향각 | degree |
| `mach` | 마하수 | 무차원 |
| `dynamic_pressure` | 동압 | Pa |
| `current_mass` | 연료 소모를 반영한 현재 질량 | kg |
| `drag_force` | $D = q C_d A$로 계산한 항력 | N |
| `Target_X`, `Target_Y` | 최종 탄착점 좌표 | m |
| `Target_T` | 총 비행시간 | s |

같은 `sim_id`의 모든 행에는 회차별 입력값과 최종 타깃값이 반복 저장됩니다. 위치와 물리 상태 변수는 `time_step` 및 고도에 따라 변합니다.

## 6. Summary 데이터 컬럼

Summary 파일은 한 회차를 한 행으로 요약합니다.

| 컬럼 | 의미 | 단위 |
|---|---|---|
| `sim_id`, `missile_type` | 회차와 기종 | - |
| `wind_u`, `wind_v` | 회차별 바람 입력 | m/s |
| `cd_factor` | 공기저항계수 변동 배율 | 무차원 |
| `initial_mass_factor` | 초기 질량 변동 배율 | 무차원 |
| `launch_elevation`, `launch_azimuth` | 발사 조건 | degree |
| `apogee_z` | 최고 고도 | m |
| `max_mach` | 최대 마하수 | 무차원 |
| `max_q` | 최대 동압 | Pa |
| `max_drag_force` | 최대 항력 | N |
| `flight_time` | 총 비행시간 | s |
| `target_x`, `target_y` | 최종 탄착점 좌표 | m |
| `range_error` | 기준 목표점과 탄착점 사이 거리 | m |

`range_error`는 설정 셀의 `TARGET_X`, `TARGET_Y`를 기준으로 계산합니다. CEP는 각 기종의 탄착점 평균 중심을 기준으로 50%의 점이 포함되는 원의 반경으로 계산합니다.

## 7. EDA 분석 구성

### Sensitivity Analysis

Monte Carlo 입력 변수와 `Target_X`, `Target_Y`, `range_error`의 상관관계를 계산합니다. 상관계수는 영향 방향과 선형 연관성을 보여주며, 비선형 효과와 변수 상호작용을 확인하려면 회귀·Sobol 분석을 추가해야 합니다.

### Comparative Analysis

기종별 `max_mach`, `max_q`, 고도-속도 프로파일을 비교합니다. 이를 통해 추진 성능, 질량, 형상, 비행시간 차이가 마하수와 공력 하중에 나타나는 양상을 확인합니다.

### Descriptive Analysis

`custom_pressure`, `custom_temperature`에서 계산한 밀도 곡선과 시뮬레이션 기록값을 비교합니다. 이후 밀도-항력, 밀도-가속도 관계를 확인해 대기 모델과 항공역학 계산이 데이터에 반영되었는지 검증합니다.

### Uncertainty & Scatter Analysis

기종별 탄착점 산점도, CEP, `range_error` 히스토그램과 50·90백분위수를 비교합니다. 이는 동일 기종 안에서 환경 불확실성이 만드는 탄착점 산만도와 오차 범위를 보여줍니다.

## 8. 실행 방법

1. `test.ipynb`를 엽니다.
2. 패키지 설치 셀과 import·설정·모델 정의 셀을 순서대로 실행합니다.
3. 데이터 생성 셀을 실행해 기종별 시계열 및 Summary CSV를 생성합니다.
4. 데이터 로더와 전처리 셀을 실행합니다.
5. 분석 셀을 순서대로 실행해 상관관계, 기종 비교, 대기 모델 검증, CEP 결과를 확인합니다.

## 9. 해석상의 한계

- 현재 실행 설정은 기종당 10회인 파이프라인 검증용 표본입니다. 10,000회 규모의 결론에는 더 큰 표본과 신뢰구간이 필요합니다.
- Pearson 상관계수는 인과관계를 단독으로 증명하지 않습니다.
- 항력과 가속도는 대기 밀도뿐 아니라 속도, 질량, 추력, 공기저항계수의 영향을 함께 받습니다.
- 코드의 기종별 제원은 연구용 단순화 모델이며, 참고 문헌의 실제 제원과 동일하다고 간주해서는 안 됩니다.
- 생성 데이터는 합성 시뮬레이션 결과이며 실제 레이더 텔레메트리의 측정 오차와 운용 조건을 모두 포함하지 않습니다.